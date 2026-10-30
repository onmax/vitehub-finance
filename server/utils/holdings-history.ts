// A holdings account's past: what it held at the close of each day, walked back from today's holdings through its coin
// movements, and what that was worth at each day's price.
import { addDays } from "./dates"

/** One change to a holding's quantity: whole coins, signed, fees included. */
interface CoinChange {
  date: string
  symbol: string
  quantity: number
}

export interface CoinHistory {
  /** The first day the changes cover in full; null when they reach back to the address's first transaction. */
  since: string | null
  changes: CoinChange[]
}

/**
 * What the account held at the close of each day before `today`, oldest first, from `history.since` (or, for a whole
 * history, the day before its first change, when the address held nothing yet) but not before `horizon`. A day closes
 * at the next day's close minus what changed on the next day. When page caps cut a whole history short, the first day
 * holds what remained before the oldest change read, which is still right.
 */
export function quantityTimeline(holdings: Array<{ symbol: string; quantity: number }>, history: CoinHistory, today: string, horizon: string) {
  const earliest = history.changes.reduce<string | null>((first, change) => (first === null || change.date < first ? change.date : first), null)
  const start = history.since ?? (earliest === null ? null : addDays(earliest, -1))
  if (start === null) return []
  const from = start > horizon ? start : horizon
  const changed = new Map<string, CoinChange[]>()
  for (const change of history.changes) changed.set(change.date, [...(changed.get(change.date) ?? []), change])
  const held = new Map<string, number>()
  for (const holding of holdings) held.set(holding.symbol.toUpperCase(), (held.get(holding.symbol.toUpperCase()) ?? 0) + holding.quantity)
  const days: Array<{ date: string; quantities: Record<string, number> }> = []
  for (let day = today; day > from; ) {
    for (const change of changed.get(day) ?? []) held.set(change.symbol.toUpperCase(), (held.get(change.symbol.toUpperCase()) ?? 0) - change.quantity)
    day = addDays(day, -1)
    days.push({ date: day, quantities: Object.fromEntries(held) })
  }
  return days.reverse()
}

/**
 * Each day's holdings valued at `price(symbol, date)`, in minor units (`digits` decimals). A day with a coin it held but
 * can't price is left out rather than written low.
 */
export function valueTimeline(
  timeline: Array<{ date: string; quantities: Record<string, number> }>,
  price: (symbol: string, date: string) => number | null,
  digits: number,
) {
  const scale = 10 ** digits
  const values: Array<{ date: string; valueMinor: number }> = []
  for (const { date, quantities } of timeline) {
    let value = 0
    let priced = true
    for (const [symbol, quantity] of Object.entries(quantities)) {
      if (Math.abs(quantity) < 1e-12) continue
      const unit = price(symbol, date)
      if (unit === null) priced = false
      else value += quantity * unit
    }
    if (priced) values.push({ date, valueMinor: Math.round(value * scale) })
  }
  return values
}
