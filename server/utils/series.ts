// Daily balance series from sparse snapshots. Pure: tests import it without ViteHub.
import { eachDay } from "./dates"

/**
 * One value per day from `from` to `to`: the latest snapshot on or before that day, so a day without a sync carries
 * the last known balance forward. `initial` is the balance before `from` (the last snapshot ahead of the window);
 * days before any known value are null.
 */
export function carryForward(
  snapshots: Array<{ date: string; balanceMinor: number }>,
  from: string,
  to: string,
  initial: number | null = null,
) {
  const sorted = [...snapshots].filter((row) => row.date >= from && row.date <= to).sort((a, b) => a.date.localeCompare(b.date))
  let index = 0
  let value = initial
  return eachDay(from, to).map((date) => {
    while (index < sorted.length && sorted[index]!.date <= date) value = sorted[index++]!.balanceMinor
    return { date, value }
  })
}
