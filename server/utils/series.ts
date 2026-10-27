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

/**
 * The household's net worth per day from each account's daily values in one currency (null before its first known
 * balance), aligned with `dates`. Days before any account had a balance are 0. After that, an account whose balances
 * start later counts its first known one on the days before: nothing says what it held before it was connected, and
 * counting 0 would show connecting it as growth. The change across the series is then each account's change since its
 * first known balance. An account whose history was rebuilt (a bank's transactions, a wallet's) starts where that
 * history starts, at what it held before it, so real deposits still show.
 */
export function netWorthSeries(dates: string[], accounts: Array<Array<number | null>>) {
  const firsts = accounts.map((values) => values.findIndex((value) => value !== null))
  const known = firsts.filter((index) => index !== -1)
  const start = known.length ? Math.min(...known) : dates.length
  return dates.map((date, day) => ({
    date,
    valueMinor:
      day < start ? 0 : accounts.reduce((sum, values, account) => (firsts[account] === -1 ? sum : sum + (values[day] ?? values[firsts[account]!]!)), 0),
  }))
}
