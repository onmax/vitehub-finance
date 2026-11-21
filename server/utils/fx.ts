import { log } from "evlog"
import { defineCachedFunction } from "vite-hub/cache"
import { USER_AGENT } from "../providers/types"
import { convertWithRates } from "../../shared/money"

interface Rates {
  at: number
  rates: Record<string, number>
}

/**
 * Exchange rates from the ECB through Frankfurter (frankfurter.dev, free, no key), cached for 12 hours. Totals in the
 * household's currency convert each account's balance with these. When Frankfurter fails, the stored rates stay in use
 * for a week: a stale rate beats no total.
 */
const fetchRates = defineCachedFunction(
  async (base: string): Promise<Rates> => {
    const response = await fetch(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}`, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error(`Frankfurter answered ${response.status}`)
    const body = (await response.json()) as { rates: Record<string, number> }
    return { at: Date.now(), rates: { ...body.rates, [base]: 1 } }
  },
  { name: "fx-rates", getKey: (base: string) => base, maxAge: 12 * 60 * 60, staleIfError: 7 * 24 * 60 * 60 },
)

/** The rates into `base` (units of each currency per one `base`) and when they were fetched. */
export async function ratesWithTime(base: string): Promise<Rates> {
  return fetchRates(base).catch((error: unknown) => {
    // With nothing cached, other currencies count at 1:1 until the API answers.
    log.warn({ action: "fx-rates", base, error: String(error) })
    return { at: 0, rates: { [base]: 1 } }
  })
}

export async function rates(base: string): Promise<Record<string, number>> {
  return (await ratesWithTime(base)).rates
}

/** Without a rate for `from`, the amount counts as is: a total with one odd currency beats no total. */
const convertWith = (table: Record<string, number>, minor: number, from: string, to: string) => convertWithRates(table, minor, from, to) ?? minor

/** A converter bound to one target currency, for summing many amounts with one rate lookup. */
export async function converterTo(to: string) {
  const table = await rates(to)
  return (minor: number, from: string) => (from === to ? minor : convertWith(table, minor, from, to))
}
