// Labels and colors the forecast's charts and lists share. Dates are the server's `YYYY-MM-DD` days, read in UTC so a
// day never shifts with the browser's timezone.
import type { ForecastConfidence, ForecastKind } from "#shared/api"
import { currentFormatLocale as locale } from "../lib/i18n"

/** A `YYYY-MM-DD` day as a UTC date, for scales and Intl. */
export const utcDay = (date: string) => new Date(`${date}T00:00:00Z`)

const formatters = new Map<string, Intl.DateTimeFormat>()
function intl(options: Intl.DateTimeFormatOptions) {
  const key = `${locale()}:${JSON.stringify(options)}`
  let formatter = formatters.get(key)
  if (!formatter) formatters.set(key, (formatter = new Intl.DateTimeFormat(locale(), { ...options, timeZone: "UTC" })))
  return formatter
}

/** "Wed 14 Dec", with the year when it isn't `today`'s. */
export function forecastDay(date: string, today: string, { weekday = true } = {}) {
  return intl({
    weekday: weekday ? "short" : undefined,
    day: "numeric",
    month: "short",
    year: date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
  }).format(utcDay(date))
}

/** "Dec", or "Jan 27" where the year turns. */
export function forecastMonthTick(date: string, today: string) {
  const month = intl({ month: "short" }).format(utcDay(date))
  return date.slice(5, 7) === "01" && date.slice(0, 4) !== today.slice(0, 4) ? `${month} ${date.slice(2, 4)}` : month
}

/** "today", "tomorrow", "in 5 days", "in 3 weeks". */
export function forecastWhen(date: string, today: string) {
  const days = Math.round((utcDay(date).getTime() - utcDay(today).getTime()) / 86_400_000)
  if (days === 0) return translate("todayLower")
  if (days === 1) return translate("tomorrowLower")
  if (days < 0) return days === -1 ? translate("yesterdayLower") : translate('daysAgo', { value1: -days })
  if (days < 14) return translate('inDays2', { value1: days })
  return translate('inWeeks', { value1: Math.round(days / 7) })
}

export const CONFIDENCE: Record<ForecastConfidence, { label: string; dots: number; class: string }> = {
  high: { get label() { return translate('sure') }, dots: 3, class: "text-emerald-600 dark:text-emerald-400" },
  medium: { get label() { return translate('likely2') }, dots: 2, class: "text-toned" },
  low: { get label() { return translate('unsure') }, dots: 1, class: "text-amber-600 dark:text-amber-400" },
}

/** Why the forecast is as sure as it is, in a sentence. */
export function confidenceReason(series: { confidence: ForecastConfidence; occurrences: number; dayRange: number; amountRange: number; status: string; cadence: string }) {
  const parts: string[] = []
  if (series.occurrences === 0) return series.status === "confirmed" ? translate('youConfirmedItButNoPaymentsShowedUpLately') : translate('noPaymentsSeenLately')
  parts.push(translate('seen', { count: series.occurrences }, series.occurrences))
  parts.push(series.dayRange === 0 ? translate('alwaysOnSchedule') : translate('landsWithinOfItsDate', { count: series.dayRange }, series.dayRange))
  parts.push(series.amountRange <= 0.01 ? translate('sameAmount') : translate('amountVaries', { value1: Math.round(series.amountRange * 100) }))
  return translate(series.status === "confirmed" ? "confidenceConfirmed" : "confidenceDetected", { seen: parts[0], timing: parts[1], amount: parts[2] })
}

/** One color per kind of money, for chart fills and legend swatches (Tailwind classes, so dark mode follows). */
export const FLOW = {
  income: { get name() { return translate('income') }, fill: "fill-emerald-500 dark:fill-emerald-400", bg: "bg-emerald-500 dark:bg-emerald-400", text: "text-emerald-700 dark:text-emerald-400" },
  bills: { get name() { return translate('bills') }, fill: "fill-rose-500 dark:fill-rose-400", bg: "bg-rose-500 dark:bg-rose-400", text: "text-rose-700 dark:text-rose-400" },
  variable: { get name() { return translate('everydaySpending') }, fill: "fill-rose-300 dark:fill-rose-300/45", bg: "bg-rose-300 dark:bg-rose-300/45", text: "text-rose-600 dark:text-rose-300" },
  moved: { get name() { return translate('movedOut') }, fill: "fill-sky-400 dark:fill-sky-500", bg: "bg-sky-400 dark:bg-sky-500", text: "text-sky-700 dark:text-sky-400" },
  oneOff: { get name() { return translate('oneOff') }, fill: "fill-violet-500 dark:fill-violet-400", bg: "bg-violet-500 dark:bg-violet-400", text: "text-violet-700 dark:text-violet-400" },
} as const

export const kindFlow = (kind: ForecastKind) => (kind === "income" ? FLOW.income : kind === "bill" ? FLOW.bills : FLOW.moved)
