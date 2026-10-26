import { log } from "evlog"
import { kv } from "vite-hub/kv"
import { useServerEnv } from "#vitehub/env/server"
import { currencyDigits } from "#shared/money"
import { USER_AGENT } from "../providers/types"
import { rates } from "./fx"

/**
 * What one unit of a coin or a fiat currency is worth, for crypto holdings and wallet transactions. Coins come from CoinGecko's simple price API
 * (cached in KV for 10 minutes), and from Kraken's public ticker for the ones CoinGecko can't answer; fiat balances on
 * exchanges (EUR, USD…) from the ECB rates in fx.ts. A symbol nobody knows prices at null and counts as 0: a sync never
 * fails over a price.
 */
const TTL = 10 * 60 * 1000

// ISO 4217 codes exchanges hold as cash. Anything else is treated as a coin.
const FIAT = new Set(
  "EUR USD GBP CHF JPY CAD AUD NZD SEK NOK DKK PLN CZK HUF RON BGN TRY BRL MXN ARS CLP COP ZAR INR IDR KRW SGD HKD CNY THB MYR PHP ILS AED SAR".split(
    " ",
  ),
)

export const isFiat = (symbol: string) => FIAT.has(symbol.toUpperCase())

interface Cached {
  at: number
  price: number | null
}

async function coingecko(symbols: string[], currency: string): Promise<Record<string, number | null> | null> {
  const apiKey = useServerEnv().coingecko.apiKey.unseal()
  const result: Record<string, number | null> = {}
  const vs = currency.toLowerCase()
  // Keep URLs short: CoinGecko answers a few dozen symbols per call comfortably.
  for (let index = 0; index < symbols.length; index += 40) {
    const batch = symbols.slice(index, index + 40)
    const url = `https://api.coingecko.com/api/v3/simple/price?symbols=${batch.map((symbol) => encodeURIComponent(symbol.toLowerCase())).join(",")}&vs_currencies=${vs}`
    try {
      const response = await fetch(url, {
        // Workers send no User-Agent by default, and CoinGecko's edge answers 403 without one.
        headers: { accept: "application/json", "user-agent": USER_AGENT, ...(apiKey ? { "x-cg-demo-api-key": apiKey } : {}) },
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) throw new Error(`CoinGecko answered ${response.status}`)
      const body = (await response.json()) as Record<string, Record<string, number> | undefined>
      for (const symbol of batch) {
        const price = body[symbol.toLowerCase()]?.[vs]
        result[symbol] = typeof price === "number" && Number.isFinite(price) ? price : null
      }
    } catch (error) {
      log.warn({ action: "crypto-prices", provider: "coingecko", error: String(error) })
      return null
    }
  }
  return result
}

// Kraken names Bitcoin XBT; other common coins keep their tickers.
const KRAKEN_NAMES: Record<string, string> = { BTC: "XBT" }

/** Last trade prices from Kraken's public ticker, one pair per call (an unknown pair fails the whole request). */
async function kraken(symbols: string[], currency: string): Promise<Record<string, number | null>> {
  const result: Record<string, number | null> = {}
  for (const symbol of symbols) {
    const pair = `${KRAKEN_NAMES[symbol] ?? symbol}${currency}`
    try {
      const response = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pair)}`, {
        headers: { accept: "application/json", "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(6000),
      })
      const body = (await response.json()) as { error?: string[]; result?: Record<string, { c?: [string, string] }> }
      const ticker = body.result ? Object.values(body.result)[0] : undefined
      const price = ticker?.c ? Number(ticker.c[0]) : NaN
      result[symbol] = Number.isFinite(price) && price > 0 ? price : null
    } catch {
      result[symbol] = null
    }
  }
  return result
}

/** Prices per unit in major units of `currency` (12345.67), keyed by the symbols as given. */
export async function quotes(symbols: string[], currency: string): Promise<Record<string, number | null>> {
  const unique = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))]
  const out: Record<string, number | null> = {}
  const fiat = unique.filter(isFiat)
  if (fiat.length) {
    const table = await rates(currency)
    for (const symbol of fiat) {
      const rate = symbol === currency ? 1 : table[symbol]
      out[symbol] = rate ? 1 / rate : null
    }
  }
  const coins = unique.filter((symbol) => !isFiat(symbol))
  const stale: Record<string, number | null> = {}
  const missing: string[] = []
  for (const symbol of coins) {
    const [, cached] = await kv.get<Cached>(`price:${currency}:${symbol}`)
    if (cached && Date.now() - cached.at < TTL) out[symbol] = cached.price
    else {
      if (cached) stale[symbol] = cached.price
      missing.push(symbol)
    }
  }
  if (missing.length) {
    const fresh = await coingecko(missing, currency)
    const unanswered = missing.filter((symbol) => fresh?.[symbol] == null)
    const fallback = unanswered.length ? await kraken(unanswered, currency) : {}
    for (const symbol of missing) {
      const price = fresh?.[symbol] ?? fallback[symbol] ?? null
      if (price !== null || fresh) {
        out[symbol] = price
        await kv.set(`price:${currency}:${symbol}`, { at: Date.now(), price } satisfies Cached)
      } else {
        // An old price beats none while both sources are down.
        out[symbol] = stale[symbol] ?? null
      }
    }
  }
  return out
}

/** Per-unit prices in minor units of `currency`, null when unknown. */
export async function priceMinor(symbols: string[], currency: string): Promise<Record<string, number | null>> {
  const prices = await quotes(symbols, currency)
  const scale = 10 ** currencyDigits(currency)
  return Object.fromEntries(Object.entries(prices).map(([symbol, price]) => [symbol, price === null ? null : Math.round(price * scale)]))
}

/**
 * Holdings with their price and value in `currency`. A holding with the provider's own quote (a broker's mark price)
 * keeps it, converted at the ECB rate; the rest are priced as coins. Values come from the exact price, not the rounded
 * per-unit one.
 */
export async function valueHoldings<H extends { symbol: string; quantity: number; quote?: { currency: string; price: number; value: number } }>(
  holdings: H[],
  currency: string,
) {
  const prices = await quotes(
    holdings.filter((holding) => !holding.quote).map((holding) => holding.symbol),
    currency,
  )
  const table = holdings.some((holding) => holding.quote) ? await rates(currency) : {}
  const scale = 10 ** currencyDigits(currency)
  return holdings.map((holding) => {
    if (holding.quote) {
      // `rates` gives units of each currency per unit of `currency`; an unknown one counts 1:1, like fx.ts.
      const rate = holding.quote.currency.toUpperCase() === currency ? 1 : (table[holding.quote.currency.toUpperCase()] ?? 1)
      return { ...holding, priceMinor: Math.round((holding.quote.price / rate) * scale), valueMinor: Math.round((holding.quote.value / rate) * scale) }
    }
    const price = prices[holding.symbol.toUpperCase()] ?? null
    return {
      ...holding,
      priceMinor: price === null ? null : Math.round(price * scale),
      valueMinor: price === null ? 0 : Math.round(holding.quantity * price * scale),
    }
  })
}

// CoinGecko's ids for the coins wallets hold. Its keyless API serves a year of daily prices per coin.
const COINGECKO_IDS: Record<string, string> = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana", XRP: "ripple", NIM: "nimiq-2" }
const HISTORY_TTL = 12 * 60 * 60 * 1000

/** A coin's daily price in `currency` over the last year, by `YYYY-MM-DD` (the price at 00:00 UTC), cached in KV. */
async function dailyPrices(symbol: string, currency: string): Promise<Record<string, number> | null> {
  const id = COINGECKO_IDS[symbol]
  if (!id) return null
  const key = `price-history:${currency}:${symbol}`
  const [, cached] = await kv.get<{ at: number; prices: Record<string, number> }>(key)
  if (cached && Date.now() - cached.at < HISTORY_TTL) return cached.prices
  const apiKey = useServerEnv().coingecko.apiKey.unseal()
  try {
    const response = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=${currency.toLowerCase()}&days=365&interval=daily`, {
      headers: { accept: "application/json", "user-agent": USER_AGENT, ...(apiKey ? { "x-cg-demo-api-key": apiKey } : {}) },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error(`CoinGecko answered ${response.status}`)
    const body = (await response.json()) as { prices?: Array<[number, number]> }
    const prices: Record<string, number> = {}
    for (const [time, price] of body.prices ?? [])
      if (Number.isFinite(price) && price > 0) prices[new Date(time).toISOString().slice(0, 10)] ??= price
    await kv.set(key, { at: Date.now(), prices })
    return prices
  } catch (error) {
    console.warn(`[finance] Price history for ${symbol} unavailable`, error)
    return cached?.prices ?? null
  }
}

/**
 * Coin movements as transactions in `currency`, valued at the coin's price on their day: what they were worth when they
 * happened, as a bank statement would show them. Days outside CoinGecko's year take the closest day it has; a coin with
 * no history takes today's price. Rows that round to nothing (dust, spam) and coins nobody can price are left out.
 */
export async function valueCoinTransactions<T extends { symbol: string; quantity: number; date: string }>(rows: T[], currency: string) {
  const symbols = [...new Set(rows.map((row) => row.symbol.toUpperCase()))]
  const today = await quotes(symbols, currency)
  const history = new Map<string, { prices: Record<string, number>; days: string[] } | null>()
  for (const symbol of symbols) {
    const prices = await dailyPrices(symbol, currency)
    history.set(symbol, prices && Object.keys(prices).length ? { prices, days: Object.keys(prices).sort() } : null)
  }
  const scale = 10 ** currencyDigits(currency)
  const valued: Array<Omit<T, "symbol" | "quantity"> & { amountMinor: number; currency: string }> = []
  for (const row of rows) {
    const symbol = row.symbol.toUpperCase()
    const series = history.get(symbol)
    const price = series ? (series.prices[row.date] ?? series.prices[closest(series.days, row.date)]) : today[symbol]
    if (!price) continue
    const amountMinor = Math.round(row.quantity * price * scale)
    if (amountMinor === 0) continue
    const { symbol: _symbol, quantity: _quantity, ...rest } = row
    valued.push({ ...rest, amountMinor, currency })
  }
  return valued
}

/** The latest of the sorted days on or before `date`, or the first one when `date` is before them all. */
function closest(days: string[], date: string) {
  let found = days[0]!
  for (const day of days) if (day <= date) found = day
  return found
}
