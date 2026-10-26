// Cash-flow projection: the math behind GET /api/forecast. Pure, so vitest runs it directly; server/utils/forecast.ts
// loads what it needs (accounts, recurring series, transactions, balances) already converted to the household currency.
import type { Cadence, Forecast, ForecastAccount, ForecastConfidence, ForecastDay, ForecastKind, ForecastPayment, ForecastSeries } from "#shared/api"
import { dailyShare, lowestOf, riskDateOf, summarizeMonths } from "../../shared/forecast"
import { addDays, daysBetween, monthEnd, monthOf, monthStart, shiftMonth } from "./dates"
import { advance, occurrencesBetween } from "./recurring-core"

/** The z-score of the 10th and 90th percentiles: the range holds the balance 8 times in 10. */
const Z80 = 1.2816

/** How far back the range looks for how much everyday spending moves from week to week. */
const SPREAD_DAYS = 182

/** A payment this many days late still counts, on today. */
const LATE_DAYS = 7

export interface CoreAccount {
  id: string
  name: string
  ownerName: string
  kind: ForecastAccount["kind"]
  /** Household currency. */
  balanceMinor: number
}

export interface CoreSeries {
  id: string
  accountId: string
  accountName: string
  ownerName: string
  name: string
  /** The merchant key (recurring-core `seriesKey`) that ties the series to its transactions. */
  key: string
  kind: ForecastKind
  /** The latest payment, household currency, negative for charges. */
  amountMinor: number
  cadence: Cadence
  nextDate: string
  categoryId: string | null
  status: "detected" | "confirmed"
}

/** A visible, not excluded transaction on a projected account, household currency. */
export interface CoreRow {
  accountId: string
  date: string
  amountMinor: number
  /** In a transfer category: a move between accounts, not spending or income. */
  transfer: boolean
  /** recurring-core `seriesKey`, to match the row to a series. */
  key: string | null
}

export interface ForecastInput {
  today: string
  months: number
  accounts: CoreAccount[]
  series: CoreSeries[]
  /** At least the last 400 days, for the series' history; the averages and the range use the recent part. */
  rows: CoreRow[]
  /** The oldest transaction on the projected accounts, or null without any. */
  since: string | null
  /** The actual balance before today, oldest first. */
  history: Array<{ date: string; balanceMinor: number }>
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

const deviation = (values: number[]) => {
  if (values.length < 2) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1))
}

/** How regular a series has been: its last payments (one per day), oldest first. */
export function regularity(
  series: Pick<CoreSeries, "amountMinor" | "cadence" | "status">,
  payments: Array<{ date: string; amountMinor: number }>,
): Pick<ForecastSeries, "confidence" | "occurrences" | "dayRange" | "amountRange" | "amountMinor"> & { amountSd: number } {
  const byDate = new Map<string, number>()
  for (const payment of [...payments].sort((a, b) => a.date.localeCompare(b.date))) byDate.set(payment.date, payment.amountMinor)
  const dates = [...byDate.keys()]
  const recent = dates.slice(-7)
  // How far each payment landed from where the one before it said it would: a skipped month (a quiet August) counts
  // from the nearest expected date, not as a month late.
  let dayRange = 0
  for (let index = 1; index < recent.length; index++) {
    const off = [1, 2, 3].map((steps) => Math.abs(daysBetween(advance(recent[index - 1]!, series.cadence, steps), recent[index]!)))
    dayRange = Math.max(dayRange, Math.min(...off))
  }
  const amounts = recent.slice(-6).map((date) => byDate.get(date)!)
  // A fixed price that changed (two or more payments at the new one) is that price, not a spread around the old one.
  const latest = amounts.at(-1)
  const repriced = amounts.length >= 2 && amounts.at(-2) === latest
  const settled = repriced ? amounts.slice(amounts.findLastIndex((amount) => amount !== latest) + 1) : amounts
  const typical = settled.length ? median(settled) : series.amountMinor
  const amountRange = typical ? Math.max(0, ...settled.map((amount) => Math.abs(amount - typical) / Math.abs(typical))) : 0
  const confirmed = series.status === "confirmed"
  const enough = dates.length >= (series.cadence === "yearly" ? 2 : 4) || confirmed
  const confidence: ForecastConfidence =
    dayRange <= 3 && amountRange <= 0.05 && enough
      ? "high"
      : dayRange <= 7 && amountRange <= 0.25 && (dates.length >= 3 || series.cadence === "yearly" || confirmed)
        ? "medium"
        : "low"
  return {
    confidence,
    occurrences: dates.length,
    dayRange,
    amountRange: Math.round(amountRange * 100) / 100,
    // A fixed price is the latest one (a price change counts at once); a moving amount is its recent median.
    amountMinor: amountRange <= 0.05 ? series.amountMinor : Math.round(typical),
    amountSd: deviation(settled),
  }
}

/** A series' payments in `[today, end]`, from its next date. A payment up to a week late still comes, today. */
export function upcomingDates(nextDate: string, cadence: Cadence, today: string, end: string) {
  const dates: string[] = []
  occurrencesBetween(nextDate, cadence, nextDate, end).forEach((date, index) => {
    if (date >= today) dates.push(date)
    else if (index === 0 && daysBetween(date, today) <= LATE_DAYS) dates.push(today)
  })
  return dates
}

/** The last `count` full months before `today`'s month, oldest first. */
export const fullMonthsBefore = (today: string, count: number) =>
  Array.from({ length: count }, (_, index) => shiftMonth(monthOf(today), index - count))

/**
 * The days the averages come from: the last 3 full months, or, when the data starts inside them, from the oldest
 * transaction on. With under 4 weeks there, the days from the oldest transaction to yesterday instead, so a household
 * that connected its bank two weeks ago gets an average from those two weeks. `months`: what a total over the period
 * divides by to make a monthly average.
 */
export function averagingPeriod(today: string, since: string | null) {
  const window = fullMonthsBefore(today, 3)
  const start = monthStart(window[0]!)
  const end = monthEnd(window.at(-1)!)
  if (!since || since <= start) return { from: start, to: end, months: 3 }
  const recent = since <= end && daysBetween(since, end) + 1 >= 28
  const from = since
  const to = recent ? end : addDays(today, -1)
  const days = Math.max(1, daysBetween(from, to) + 1)
  return { from, to, months: days / (365.25 / 12) }
}

/**
 * The actual balance over the days before today, summed over accounts. An account without a balance yet on a day
 * counts its first known one (its history starts when it was connected), and one without any its balance today.
 */
export function combineHistory(accounts: Array<{ days: Array<{ date: string; value: number | null }>; currentMinor: number }>) {
  const totals = new Map<string, number>()
  for (const account of accounts) {
    const first = account.days.find((day) => day.value !== null)?.value ?? account.currentMinor
    for (const day of account.days) totals.set(day.date, (totals.get(day.date) ?? 0) + (day.value ?? first))
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([date, balanceMinor]) => ({ date, balanceMinor }))
}

/**
 * What a row is to the averages: spending outside recurring payments (`variable`), a move outside recurring ones
 * (`moved`, signed), or nothing (a recurring payment, or money coming in that isn't a transfer).
 */
function flexOf(row: CoreRow, inSeries: boolean) {
  if (inSeries) return null
  if (row.transfer) return { variable: 0, moved: -row.amountMinor }
  return row.amountMinor < 0 ? { variable: -row.amountMinor, moved: 0 } : null
}

/**
 * Today's cash, then day by day to the end of the last month: each series' payments when they fall due, plus the usual
 * spending and the usual moves to other accounts, spread evenly over the days. Usual means the average of the last
 * 3 full months of what no recurring series explains. Each account is projected the same way on its own, so moves
 * between two projected accounts cancel out in the total.
 *
 * The range around the expected balance is the 10th to 90th percentile of a normal spread: everyday spending's
 * week-to-week standard deviation over the last 26 weeks, growing with the square root of the weeks ahead, plus the
 * uncertainty of its average itself, which grows with the weeks ahead (so the range widens over time), plus how much
 * each recurring amount moves.
 */
export function buildForecast(input: ForecastInput): Omit<Forecast, "currency"> {
  const { today } = input
  const end = monthEnd(shiftMonth(monthOf(today), input.months - 1))
  const projected = new Set(input.accounts.map((account) => account.id))
  const seriesKeys = new Map(input.series.map((entry) => [`${entry.accountId}|${entry.key}`, entry]))

  // Each series' history, then what to expect from it.
  const history = new Map<string, Array<{ date: string; amountMinor: number }>>()
  for (const row of input.rows) {
    const series = row.key ? seriesKeys.get(`${row.accountId}|${row.key}`) : undefined
    if (series) history.set(series.id, [...(history.get(series.id) ?? []), { date: row.date, amountMinor: row.amountMinor }])
  }
  const spreads = new Map<string, number>()
  const series: ForecastSeries[] = input.series
    .filter((entry) => projected.has(entry.accountId))
    .map(({ key: _, amountMinor, ...entry }) => {
      const { amountSd, ...regular } = regularity({ ...entry, amountMinor }, history.get(entry.id) ?? [])
      spreads.set(entry.id, amountSd)
      return { ...entry, ...regular }
    })
  const payments: Array<ForecastPayment & { accountId: string }> = series
    .flatMap((entry) =>
      upcomingDates(input.series.find((item) => item.id === entry.id)!.nextDate, entry.cadence, today, end).map((date) => ({
        seriesId: entry.id,
        accountId: entry.accountId,
        date,
        amountMinor: entry.amountMinor,
      })),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.seriesId.localeCompare(b.seriesId))

  // Usual spending and moves per account, from the last 3 full months.
  const period = averagingPeriod(today, input.since)
  const { from, to } = period
  const monthly = (total: number) => Math.round(total / period.months)
  const usual = new Map(input.accounts.map((account) => [account.id, { variable: 0, moved: 0 }]))
  let income = 0
  let spent = 0
  const spreadFrom = [input.since ?? today, addDays(today, -SPREAD_DAYS)].sort().at(-1)!
  const weeks = Math.floor(daysBetween(spreadFrom, today) / 7)
  const weekly = Array.from({ length: weeks }, () => 0)
  for (const row of input.rows) {
    if (!projected.has(row.accountId)) continue
    const flex = flexOf(row, Boolean(row.key && seriesKeys.has(`${row.accountId}|${row.key}`)))
    if (row.date >= from && row.date <= to) {
      if (!row.transfer) {
        if (row.amountMinor > 0) income += row.amountMinor
        else spent -= row.amountMinor
      }
      if (flex) {
        const account = usual.get(row.accountId)!
        account.variable += flex.variable
        account.moved += flex.moved
      }
    }
    // Weeks counted back from yesterday, so the last one is the 7 days before today.
    const back = daysBetween(row.date, today)
    if (flex && back >= 1 && Math.ceil(back / 7) <= weeks) weekly[weeks - Math.ceil(back / 7)]! += flex.variable + flex.moved
  }
  const rates = new Map(
    [...usual].map(([id, value]) => [id, { variable: monthly(value.variable), moved: monthly(value.moved) }]),
  )
  const variableMonthlyMinor = [...rates.values()].reduce((sum, rate) => sum + rate.variable, 0)
  const movedMonthlyMinor = [...rates.values()].reduce((sum, rate) => sum + rate.moved, 0)
  // With under 3 weeks of data, assume weeks move by half their usual amount, and that the average is a month's worth.
  const weeklyMean = ((variableMonthlyMinor + Math.max(0, movedMonthlyMinor)) * 12) / 52
  const sampled = weeks >= 3
  const weekSd = sampled ? deviation(weekly) : weeklyMean * 0.5
  const weekCount = sampled ? weeks : 4

  // Day by day, for the household and for each account.
  const byDate = new Map<string, typeof payments>()
  for (const payment of payments) byDate.set(payment.date, [...(byDate.get(payment.date) ?? []), payment])
  const startMinor = input.accounts.reduce((sum, account) => sum + account.balanceMinor, 0)
  const balances = new Map(input.accounts.map((account) => [account.id, account.balanceMinor]))
  const accountDays = new Map(input.accounts.map((account) => [account.id, [] as Array<{ date: string; balanceMinor: number }>]))
  const days: ForecastDay[] = []
  let total = startMinor
  let paymentVariance = 0
  for (let date = today; date <= end; date = addDays(date, 1)) {
    for (const payment of byDate.get(date) ?? []) {
      total += payment.amountMinor
      balances.set(payment.accountId, balances.get(payment.accountId)! + payment.amountMinor)
      paymentVariance += (spreads.get(payment.seriesId) ?? 0) ** 2
    }
    if (date > today)
      for (const [id, rate] of rates) {
        const flow = dailyShare(rate.variable + rate.moved, date)
        total -= flow
        balances.set(id, balances.get(id)! - flow)
      }
    const ahead = daysBetween(today, date) / 7
    const band = Z80 * Math.sqrt(weekSd ** 2 * (ahead + ahead ** 2 / weekCount) + paymentVariance)
    days.push({ date, balanceMinor: Math.round(total), lowMinor: Math.round(total - band), highMinor: Math.round(total + band) })
    for (const [id, value] of balances) accountDays.get(id)!.push({ date, balanceMinor: Math.round(value) })
  }

  const accounts: ForecastAccount[] = input.accounts.map((account) => {
    const points = accountDays.get(account.id)!
    const lowest = points.reduce((low, point) => (point.balanceMinor < low.balanceMinor ? point : low), points[0]!)
    return {
      id: account.id,
      name: account.name,
      ownerName: account.ownerName,
      kind: account.kind,
      balanceMinor: account.balanceMinor,
      endMinor: points.at(-1)!.balanceMinor,
      lowest,
      weekly: points.filter((_, index) => index % 7 === 0 || index === points.length - 1),
    }
  })
  const averageMonthlyIncomeMinor = monthly(income)
  const plainPayments = payments.map(({ accountId: _, ...payment }) => payment)
  return {
    today,
    startMinor,
    history: [...input.history.filter((point) => point.date < today), { date: today, balanceMinor: startMinor }],
    days,
    months: summarizeMonths({ today, startMinor, days, payments: plainPayments, series, variableMonthlyMinor, movedMonthlyMinor }),
    series,
    payments: plainPayments,
    accounts,
    lowest: lowestOf(days),
    riskDate: riskDateOf(days),
    variableMonthlyMinor,
    movedMonthlyMinor,
    averageMonthlyIncomeMinor,
    monthlySavingsMinor: averageMonthlyIncomeMinor - monthly(spent),
    dataDays: input.since ? daysBetween(input.since, today) + 1 : 0,
  }
}
