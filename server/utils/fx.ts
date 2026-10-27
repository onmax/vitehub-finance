import { log } from "evlog"
import { kv } from "vite-hub/kv"
import { USER_AGENT } from "../providers/types"
import { convertWithRates } from "../../shared/money"

/**
 * Exchange rates from the ECB through Frankfurter (frankfurter.dev, free, no key), cached in KV for 12 hours.
 * Totals in the household's currency convert each account's balance with these.
 */
const TTL = 12 * 60 * 60 * 1000

interface Cached {
  at: number
  rates: Record<string, number>
}

/** The rates into `base` (units of each currency per one `base`) and when they were fetched. */
export async function ratesWithTime(base: string): Promise<Cached> {
  const key = `fx:${base}`
  const [, cached] = await kv.get<Cached>(key)
  if (cached && Date.now() - cached.at < TTL) return cached
  try {
    const response = await fetch(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}`, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error(`Frankfurter answered ${response.status}`)
    const body = (await response.json()) as { rates: Record<string, number> }
    const fresh = { at: Date.now(), rates: { ...body.rates, [base]: 1 } } satisfies Cached
    await kv.set(key, fresh)
    return fresh
  } catch (error) {
    // A stale rate beats no total; with nothing cached, other currencies count at 1:1 until the API answers.
    if (cached) return cached
    log.warn({ action: "fx-rates", base, error: String(error) })
    return { at: 0, rates: { [base]: 1 } }
  }
}

export async function rates(base: string): Promise<Record<string, number>> {
  return (await ratesWithTime(base)).rates
}

/** Without a rate for `from`, the amount counts as is: a total with one odd currency beats no total. */
const convertWith = (table: Record<string, number>, minor: number, from: string, to: string) => convertWithRates(table, minor, from, to) ?? minor

/** Converts minor units between currencies. Same currency returns the amount untouched. */
export async function convertMinor(minor: number, from: string, to: string) {
  if (from === to) return minor
  return convertWith(await rates(to), minor, from, to)
}

/** A converter bound to one target currency, for summing many amounts with one rate lookup. */
export async function converterTo(to: string) {
  const table = await rates(to)
  return (minor: number, from: string) => (from === to ? minor : convertWith(table, minor, from, to))
}
