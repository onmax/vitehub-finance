// Crypto exchanges through read-only API keys: balances only, as holdings of one `crypto` account per connection.
// Small signed fetches instead of an SDK, so the Worker bundle stays light.
import { fromBase64, hmac, importCdpKey, randomHex, sha256, signJwt, toBase64, toHex, utf8 } from "./crypto"
import { describeBody, ProviderError, readBody, request, type ProviderHolding, type ProviderResult } from "./types"

export interface ExchangeCredentials {
  key: string
  secret: string
}

export type ExchangeId = "kraken" | "binance" | "coinbase"

export const EXCHANGE_NAMES: Record<ExchangeId, string> = { kraken: "Kraken", binance: "Binance", coinbase: "Coinbase" }

/** Adds up quantities per symbol and drops zeros (an exchange lists staked and spot of one coin separately). */
export function mergeHoldings(entries: Array<{ symbol: string; quantity: number; name?: string | null }>): ProviderHolding[] {
  const merged = new Map<string, ProviderHolding>()
  for (const entry of entries) {
    if (!entry.symbol || !Number.isFinite(entry.quantity)) continue
    const current = merged.get(entry.symbol)
    if (current) current.quantity += entry.quantity
    else merged.set(entry.symbol, { symbol: entry.symbol, name: entry.name ?? null, quantity: entry.quantity })
  }
  return [...merged.values()].filter((holding) => Math.abs(holding.quantity) > 1e-12)
}

function asAccount(exchange: ExchangeId, holdings: ProviderHolding[]): ProviderResult<ExchangeCredentials> {
  return {
    accounts: [
      { externalId: "main", name: EXCHANGE_NAMES[exchange], kind: "crypto", currency: "EUR", institution: EXCHANGE_NAMES[exchange], holdings },
    ],
  }
}

// Kraken's legacy asset codes (from before it used plain tickers), plus renamed ones.
const KRAKEN_ALIASES: Record<string, string> = {
  XXBT: "BTC",
  XBT: "BTC",
  XETH: "ETH",
  XXRP: "XRP",
  XXLM: "XLM",
  XLTC: "LTC",
  XXMR: "XMR",
  XZEC: "ZEC",
  XETC: "ETC",
  XMLN: "MLN",
  XREP: "REP",
  XXDG: "DOGE",
  XDG: "DOGE",
  ZEUR: "EUR",
  ZUSD: "USD",
  ZGBP: "GBP",
  ZCAD: "CAD",
  ZJPY: "JPY",
  ZAUD: "AUD",
  ZCHF: "CHF",
  ETH2: "ETH",
}

// Four-letter tickers that start with X or Z but aren't legacy codes, so they keep their first letter.
const KRAKEN_KEEP = new Set(["ZETA", "ZEUS", "ZERO", "XCAD", "XCHF", "ZRX", "XTZ"])

/** `XXBT` → BTC, `ZEUR` → EUR, `DOT.S` → DOT, `ETH2.S` → ETH, `USDC.M` → USDC. */
export function normalizeKrakenAsset(code: string) {
  let symbol = code.toUpperCase().trim()
  // Staked (.S), opt-in rewards (.F), bonded (.B), and margin (.M) balances are still the coin.
  const suffixed = /\.(S|F|B|M|P|HOLD)$/.test(symbol)
  symbol = symbol.replace(/\.(S|F|B|M|P|HOLD)$/, "")
  // Bonded staking variants carry a lock period (DOT28.S, KSM07.S); plain tickers like API3 keep their digits.
  if (suffixed) symbol = symbol.replace(/^([A-Z]{2,})\d+$/, (whole, coin: string) => (whole === "ETH2" ? whole : coin))
  const alias = KRAKEN_ALIASES[symbol]
  if (alias) return alias
  if (symbol.length === 4 && /^[XZ]/.test(symbol) && !KRAKEN_KEEP.has(symbol)) {
    const stripped = symbol.slice(1)
    return KRAKEN_ALIASES[stripped] ?? stripped
  }
  return symbol
}

export async function krakenSignature(path: string, nonce: string, postData: string, secret: string) {
  const message = new Uint8Array([...utf8(path), ...(await sha256(nonce + postData))])
  return toBase64(await hmac("SHA-512", fromBase64(secret), message))
}

let lastNonce = 0

export async function kraken(credentials: ExchangeCredentials) {
  const path = "/0/private/Balance"
  // Kraken wants a strictly increasing nonce per key.
  lastNonce = Math.max(Date.now() * 1000, lastNonce + 1)
  const nonce = String(lastNonce)
  const postData = `nonce=${nonce}`
  let signature: string
  try {
    signature = await krakenSignature(path, nonce, postData, credentials.secret)
  } catch {
    throw new ProviderError("auth", "Kraken: the private key isn't valid base64. Copy it again from Kraken's API settings.")
  }
  const response = await request("Kraken", `https://api.kraken.com${path}`, {
    method: "POST",
    headers: {
      "API-Key": credentials.key,
      "API-Sign": signature,
      "content-type": "application/x-www-form-urlencoded; charset=utf-8",
      "user-agent": "Joxi",
    },
    body: postData,
  })
  const body = (await readBody(response)) as { error?: string[]; result?: Record<string, string> } | string
  const errors = typeof body === "object" ? (body.error ?? []) : []
  if (errors.length) {
    const message = errors.join(", ")
    if (/EAPI:Invalid (key|signature|nonce)|Permission denied|EGeneral:Permission/i.test(message))
      throw new ProviderError("auth", `Kraken rejected the key: ${message}`)
    if (/Rate limit|Throttled/i.test(message)) throw new ProviderError("rate_limited", `Kraken: ${message}`)
    throw new ProviderError("unavailable", `Kraken: ${message}`)
  }
  if (!response.ok || typeof body !== "object" || !body.result)
    throw new ProviderError("unavailable", `Kraken answered ${response.status}.`)
  return asAccount(
    "kraken",
    mergeHoldings(Object.entries(body.result).map(([code, amount]) => ({ symbol: normalizeKrakenAsset(code), quantity: Number(amount) }))),
  )
}

/** Binance lists Simple Earn positions as `LD<coin>`; they are still the coin. */
export function normalizeBinanceAsset(code: string) {
  const symbol = code.toUpperCase()
  return symbol.startsWith("LD") && symbol.length >= 5 ? symbol.slice(2) : symbol
}

export async function binance(credentials: ExchangeCredentials) {
  const query = `omitZeroBalances=true&recvWindow=10000&timestamp=${Date.now()}`
  const signature = toHex(await hmac("SHA-256", utf8(credentials.secret), query))
  const response = await request("Binance", `https://api.binance.com/api/v3/account?${query}&signature=${signature}`, {
    headers: { "X-MBX-APIKEY": credentials.key },
  })
  const body = (await readBody(response)) as { balances?: Array<{ asset: string; free: string; locked: string }>; code?: number }
  if (!response.ok) {
    const message = describeBody(body, `Binance answered ${response.status}.`)
    if (response.status === 401 || [-2014, -2015, -1022, -2008].includes(Number((body as { code?: number })?.code)))
      throw new ProviderError("auth", `Binance rejected the key: ${message}`)
    if (response.status === 429 || response.status === 418) throw new ProviderError("rate_limited", `Binance: ${message}`)
    if (response.status === 451) throw new ProviderError("unavailable", "Binance refuses requests from this server's region.")
    throw new ProviderError("unavailable", `Binance: ${message}`)
  }
  return asAccount(
    "binance",
    mergeHoldings(
      (body.balances ?? []).map((balance) => ({
        symbol: normalizeBinanceAsset(balance.asset),
        quantity: Number(balance.free) + Number(balance.locked),
      })),
    ),
  )
}

/**
 * Coinbase Advanced / CDP API keys. `key` is the key name (organizations/…/apiKeys/…), `secret` the EC private key PEM
 * or a base64 Ed25519 secret. The JWT is bound to one request (method, host, path) and lives two minutes.
 */
export async function coinbaseJwt(credentials: ExchangeCredentials, method: string, path: string, now = Math.floor(Date.now() / 1000)) {
  let signing
  try {
    signing = await importCdpKey(credentials.secret)
  } catch (error) {
    throw new ProviderError("auth", `Coinbase: the private key couldn't be read (${error instanceof Error ? error.message : error}).`)
  }
  return signJwt(
    { kid: credentials.key, nonce: randomHex(16), typ: "JWT" },
    { sub: credentials.key, iss: "cdp", nbf: now, exp: now + 120, uri: `${method} api.coinbase.com${path}` },
    signing,
  )
}

interface CoinbaseAccount {
  currency?: { code?: string; name?: string } | string
  balance?: { amount?: string; currency?: string }
}

export async function coinbase(credentials: ExchangeCredentials) {
  const entries: Array<{ symbol: string; quantity: number; name?: string | null }> = []
  let next: string | null = "/v2/accounts?limit=100"
  for (let page = 0; next && page < 20; page++) {
    const path: string = next.split("?")[0]!
    const response = await request("Coinbase", `https://api.coinbase.com${next}`, {
      headers: { authorization: `Bearer ${await coinbaseJwt(credentials, "GET", path)}`, "CB-VERSION": "2024-01-01" },
    })
    const body = (await readBody(response)) as {
      data?: CoinbaseAccount[]
      pagination?: { next_uri?: string | null }
      errors?: Array<{ message?: string }>
    }
    if (!response.ok) {
      const message = body?.errors?.[0]?.message ?? describeBody(body, `Coinbase answered ${response.status}.`)
      if (response.status === 401 || response.status === 403) throw new ProviderError("auth", `Coinbase rejected the key: ${message}`)
      if (response.status === 429) throw new ProviderError("rate_limited", `Coinbase: ${message}`)
      throw new ProviderError("unavailable", `Coinbase: ${message}`)
    }
    for (const account of body.data ?? []) {
      const code = typeof account.currency === "string" ? account.currency : account.currency?.code
      const name = typeof account.currency === "string" ? null : account.currency?.name
      const symbol = (account.balance?.currency || code || "").toUpperCase()
      entries.push({ symbol, name, quantity: Number(account.balance?.amount ?? 0) })
    }
    next = body.pagination?.next_uri || null
  }
  return asAccount("coinbase", mergeHoldings(entries))
}

export const EXCHANGES: Record<ExchangeId, (credentials: ExchangeCredentials) => Promise<ProviderResult<ExchangeCredentials>>> = {
  kraken,
  binance,
  coinbase,
}
