import { log } from "evlog"
import { kv } from "vite-hub/kv"
import { USER_AGENT } from "../providers/types"

/**
 * Exchange rates from the ECB through Frankfurter (frankfurter.dev, free, no key), cached in KV for 12 hours.
 * Totals in the household's currency convert each account's balance with these.
 */
const TTL = 12 * 60 * 60 * 1000

interface Cached {
  at: number
  rates: Record<string, number>
}

export async function rates(base: string): Promise<Record<string, number>> {
  const key = `fx:${base}`
  const [, cached] = await kv.get<Cached>(key)
  if (cached && Date.now() - cached.at < TTL) return cached.rates
  try {
    const response = await fetch(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}`, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error(`Frankfurter answered ${response.status}`)
    const body = (await response.json()) as { rates: Record<string, number> }
    const fresh = { ...body.rates, [base]: 1 }
    await kv.set(key, { at: Date.now(), rates: fresh } satisfies Cached)
    return fresh
  } catch (error) {
    // A stale rate beats no total; with nothing cached, other currencies count at 1:1 until the API answers.
    if (cached) return cached.rates
    log.warn({ action: "fx-rates", base, error: String(error) })
    return { [base]: 1 }
  }
}

/** Converts minor units between currencies. Same currency returns the amount untouched. */
export async function convertMinor(minor: number, from: string, to: string) {
  if (from === to) return minor
  const table = await rates(to)
  const rate = table[from]
  return rate ? Math.round(minor / rate) : minor
}

/** A converter bound to one target currency, for summing many amounts with one rate lookup. */
export async function converterTo(to: string) {
  const table = await rates(to)
  return (minor: number, from: string) => {
    if (from === to) return minor
    const rate = table[from]
    return rate ? Math.round(minor / rate) : minor
  }
}
