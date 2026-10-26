// The forecast's arithmetic both sides share: month totals from the daily projection, the lowest point, and what-ifs.
// The server builds the forecast with it (server/utils/forecast-core.ts); the forecast page reruns it in the browser
// when someone plays with a what-if, so a scenario never needs a request. Pure: dates are `YYYY-MM-DD` strings in UTC.
import type { Forecast, ForecastDay, ForecastMonth, ForecastPayment, ForecastSeries } from "./api"

const DAY = 86_400_000
const parse = (date: string) => Date.parse(`${date}T00:00:00Z`)
export const addDay = (date: string, days: number) => new Date(parse(date) + days * DAY).toISOString().slice(0, 10)
export const daysApart = (from: string, to: string) => Math.round((parse(to) - parse(from)) / DAY)
export const monthDays = (month: string) => {
  const [year, number] = month.split("-").map(Number) as [number, number]
  return new Date(Date.UTC(year, number, 0)).getUTCDate()
}
const monthName = (month: string) =>
  new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`))

/**
 * Spending outside recurring payments, spread evenly over a month's days: a month's average over its own length, so a
 * month's days add up to the average exactly.
 */
export const dailyShare = (monthlyMinor: number, date: string) => monthlyMinor / monthDays(date.slice(0, 7))

/** The lowest expected balance and the first day it's reached; the today point when nothing is lower. */
export function lowestOf(days: ForecastDay[]) {
  let low = days[0]
  for (const day of days) if (low && day.balanceMinor < low.balanceMinor) low = day
  return low ? { date: low.date, balanceMinor: low.balanceMinor, lowMinor: low.lowMinor } : { date: "", balanceMinor: 0, lowMinor: 0 }
}

/** The first day the low end of the range goes below zero, or null. */
export const riskDateOf = (days: ForecastDay[]) => days.find((day) => day.lowMinor < 0)?.date ?? null

export interface MonthInput {
  today: string
  startMinor: number
  days: ForecastDay[]
  payments: ForecastPayment[]
  series: Pick<ForecastSeries, "id" | "kind">[]
  variableMonthlyMinor: number
  movedMonthlyMinor: number
  /** One-off expenses (positive) by date, from a what-if. */
  oneOffs?: Array<{ date: string; amountMinor: number }>
}

/**
 * One row per month the days cover. Today's share of everyday spending is left out (the balance already holds what was
 * spent so far today); recurring payments due today count. Rounded per month, so a month's parts add up to its net.
 */
export function summarizeMonths(input: MonthInput): ForecastMonth[] {
  const kinds = new Map(input.series.map((entry) => [entry.id, entry.kind]))
  const months = new Map<string, ForecastMonth & { variable: number; moved: number }>()
  let previous = input.startMinor
  const row = (date: string) => {
    const month = date.slice(0, 7)
    let entry = months.get(month)
    if (!entry) {
      entry = {
        month,
        label: monthName(month),
        startMinor: previous,
        incomeMinor: 0,
        billsMinor: 0,
        variableOutMinor: 0,
        movedOutMinor: 0,
        oneOffMinor: 0,
        netMinor: 0,
        balanceMinor: 0,
        lowMinor: 0,
        highMinor: 0,
        variable: 0,
        moved: 0,
      }
      months.set(month, entry)
    }
    return entry
  }
  for (const day of input.days) {
    const entry = row(day.date)
    if (day.date > input.today) {
      entry.variable += dailyShare(input.variableMonthlyMinor, day.date)
      entry.moved += dailyShare(input.movedMonthlyMinor, day.date)
    }
    entry.balanceMinor = day.balanceMinor
    entry.lowMinor = day.lowMinor
    entry.highMinor = day.highMinor
    previous = day.balanceMinor
  }
  for (const payment of input.payments) {
    const entry = months.get(payment.date.slice(0, 7))
    if (!entry) continue
    const kind = kinds.get(payment.seriesId)
    if (kind === "transfer") entry.moved -= payment.amountMinor
    else if (payment.amountMinor >= 0) entry.incomeMinor += payment.amountMinor
    else entry.billsMinor -= payment.amountMinor
  }
  for (const oneOff of input.oneOffs ?? []) {
    const entry = months.get(oneOff.date.slice(0, 7))
    if (entry) entry.oneOffMinor += oneOff.amountMinor
  }
  return [...months.values()].map(({ variable, moved, ...entry }) => {
    const variableOutMinor = Math.round(variable)
    const movedOutMinor = Math.round(moved)
    return {
      ...entry,
      variableOutMinor,
      movedOutMinor,
      netMinor: entry.incomeMinor - entry.billsMinor - variableOutMinor - movedOutMinor - entry.oneOffMinor,
    }
  })
}

/** A what-if on top of the forecast. */
export interface ForecastScenario {
  /** Series left out: a cancelled subscription, an income that stops. */
  skip: string[]
  /** Every income payment scaled by this share: −0.1 is 10% less. */
  incomeChange: number
  /** A one-off expense (positive) on a day; a day before today counts today. */
  oneOff: { date: string; amountMinor: number } | null
}

export const NO_SCENARIO: ForecastScenario = { skip: [], incomeChange: 0, oneOff: null }

export const isBaseline = (scenario: ForecastScenario) =>
  scenario.skip.length === 0 && scenario.incomeChange === 0 && (scenario.oneOff === null || scenario.oneOff.amountMinor === 0)

/**
 * The forecast with a what-if applied. Every change is a fixed amount on a fixed day, so the days shift by the running
 * total of the changes and the range keeps its width: a what-if moves the money, not how sure the forecast is.
 */
export function applyScenario(forecast: Forecast, scenario: ForecastScenario) {
  const skipped = new Set(scenario.skip)
  const kinds = new Map(forecast.series.map((entry) => [entry.id, entry.kind]))
  const changes = new Map<string, number>()
  const change = (date: string, minor: number) => changes.set(date, (changes.get(date) ?? 0) + minor)
  const payments: ForecastPayment[] = []
  for (const payment of forecast.payments) {
    if (skipped.has(payment.seriesId)) {
      change(payment.date, -payment.amountMinor)
      continue
    }
    if (scenario.incomeChange && kinds.get(payment.seriesId) === "income") {
      const amountMinor = Math.round(payment.amountMinor * (1 + scenario.incomeChange))
      change(payment.date, amountMinor - payment.amountMinor)
      payments.push({ ...payment, amountMinor })
    } else payments.push(payment)
  }
  const oneOffs: Array<{ date: string; amountMinor: number }> = []
  if (scenario.oneOff && scenario.oneOff.amountMinor > 0 && forecast.days.length) {
    const date = scenario.oneOff.date < forecast.today ? forecast.today : scenario.oneOff.date
    if (date <= forecast.days.at(-1)!.date) {
      oneOffs.push({ date, amountMinor: scenario.oneOff.amountMinor })
      change(date, -scenario.oneOff.amountMinor)
    }
  }
  let shift = 0
  const days = forecast.days.map((day) => {
    shift += changes.get(day.date) ?? 0
    return shift ? { date: day.date, balanceMinor: day.balanceMinor + shift, lowMinor: day.lowMinor + shift, highMinor: day.highMinor + shift } : day
  })
  const months = summarizeMonths({
    today: forecast.today,
    startMinor: forecast.startMinor,
    days,
    payments,
    series: forecast.series,
    variableMonthlyMinor: forecast.variableMonthlyMinor,
    movedMonthlyMinor: forecast.movedMonthlyMinor,
    oneOffs,
  })
  return { days, months, payments, lowest: lowestOf(days), riskDate: riskDateOf(days) }
}
