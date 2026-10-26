// Cash-flow projection: the month math behind GET /api/forecast. Pure, so vitest runs it directly.
import type { Cadence, Forecast } from "#shared/api"
import { daysBetween, daysInMonth, monthEnd, monthLabel, monthOf, monthStart, shiftMonth } from "./dates"
import { occurrencesBetween } from "./recurring-core"

export interface ForecastSeries {
  /** Signed, in the household's currency: negative for charges. */
  amountMinor: number
  cadence: Cadence
  nextDate: string
}

/**
 * Month by month from today: each month adds the recurring payments that fall in it and the usual variable spending.
 * The current month only counts what's still ahead: recurring charges from today on, and the share of variable
 * spending for the days left (the balance already holds what was spent so far).
 */
export function projectMonths(input: {
  today: string
  months: number
  startMinor: number
  series: ForecastSeries[]
  variableMonthlyMinor: number
}): Forecast["months"] {
  const first = monthOf(input.today)
  let balance = input.startMinor
  return Array.from({ length: input.months }, (_, index) => {
    const month = shiftMonth(first, index)
    const from = index === 0 ? input.today : monthStart(month)
    const to = monthEnd(month)
    let recurringInMinor = 0
    let recurringOutMinor = 0
    for (const series of input.series) {
      const count = occurrencesBetween(series.nextDate, series.cadence, from, to).length
      if (series.amountMinor >= 0) recurringInMinor += series.amountMinor * count
      else recurringOutMinor += -series.amountMinor * count
    }
    const share = index === 0 ? (daysBetween(input.today, to) + 1) / daysInMonth(month) : 1
    const variableOutMinor = Math.round(input.variableMonthlyMinor * share)
    balance += recurringInMinor - recurringOutMinor - variableOutMinor
    return { month, label: monthLabel(month), recurringInMinor, recurringOutMinor, variableOutMinor, balanceMinor: balance }
  })
}

/** The last `count` full months before `today`'s month, oldest first. */
export const fullMonthsBefore = (today: string, count: number) =>
  Array.from({ length: count }, (_, index) => shiftMonth(monthOf(today), index - count))

/**
 * Average per month over `months`, counting only months on or after `since` (the oldest data), so a household that
 * connected its bank last month isn't averaged over months with no data.
 */
export function monthlyAverage(totalMinor: number, months: string[], since: string | null) {
  const counted = since ? months.filter((month) => month >= monthOf(since)).length : months.length
  return Math.round(totalMinor / Math.max(1, counted))
}
