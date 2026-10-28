// The forecast's arithmetic both sides share: month totals from the daily projection, the lowest point, and what-ifs.
// The server builds the forecast with it (server/utils/forecast-core.ts); the forecast page reruns it in the browser
// when someone plays with a what-if, so a scenario never needs a request. Pure: dates are `YYYY-MM-DD` strings in UTC.
import type { Forecast, ForecastDay, ForecastMonth, ForecastPayment, ForecastSeries } from "./api"
import type { PlannedEvent, PlanningForecast } from "./planning"

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

/** Planned changes never modify imported transactions. Amounts use the forecast currency. */
export interface ForecastScenario {
  skip: string[]
  incomeChange: number
  oneOff: { date: string; amountMinor: number; accountId?: string } | null
  accountId?: string
  minimumReserveMinor?: number
  protectGoals?: boolean
  spendingMode?: 'history' | 'budget'
  spendingChange?: number
  incomeDelayDays?: number
  events?: PlannedEvent[]
}

export const NO_SCENARIO: ForecastScenario = { skip: [], incomeChange: 0, oneOff: null }
export const isBaseline = (scenario: ForecastScenario) =>
  !scenario.skip.length && !scenario.incomeChange && !scenario.oneOff?.amountMinor &&
  !scenario.spendingChange && !scenario.incomeDelayDays && scenario.spendingMode !== 'budget' && !scenario.events?.length

/** Repeats anchored to the original day, so 31 January becomes 28 February then 31 March. */
export function plannedDates(event: PlannedEvent, today: string, end: string): string[] {
  const dates: string[] = []
  const stop = event.endDate && event.endDate < end ? event.endDate : end
  if (event.cadence === 'once') return event.date >= today && event.date <= stop ? [event.date] : []
  const origin = new Date(`${event.date}T00:00:00Z`)
  for (let index = 0; index < 10000; index++) {
    let date: string
    if (event.cadence === 'weekly') date = addDay(event.date, index * 7)
    else {
      const step = event.cadence === 'monthly' ? 1 : event.cadence === 'quarterly' ? 3 : 12
      const month = new Date(Date.UTC(origin.getUTCFullYear(), origin.getUTCMonth() + index * step, 1))
      const day = Math.min(origin.getUTCDate(), monthDays(month.toISOString().slice(0, 7)))
      month.setUTCDate(day)
      date = month.toISOString().slice(0, 10)
    }
    if (date > stop) break
    if (date >= today) dates.push(date)
  }
  return dates
}

export function applyScenario(forecast: Forecast & Partial<Pick<PlanningForecast, 'accountDays' | 'accountFlows' | 'planning'>>, scenario: ForecastScenario) {
  const byId = new Map(forecast.series.map(entry => [entry.id, entry]))
  const skipped = new Set(scenario.skip)
  const changes = new Map<string, Map<string, number>>()
  const firstAccount = forecast.accounts.find(account => account.kind !== 'credit')?.id ?? forecast.accounts[0]?.id ?? ''
  const requestedAccount = scenario.oneOff?.accountId ?? scenario.accountId
  const payingAccount = forecast.accounts.some(account => account.id === requestedAccount) ? requestedAccount! : firstAccount
  const change = (date: string, accountId: string, minor: number) => {
    if (date < forecast.today || date > (forecast.days.at(-1)?.date ?? '')) return
    const accounts = changes.get(date) ?? new Map<string, number>()
    accounts.set(accountId, (accounts.get(accountId) ?? 0) + minor)
    changes.set(date, accounts)
  }
  const payments: ForecastPayment[] = []
  for (const payment of forecast.payments) {
    const entry = byId.get(payment.seriesId)
    if (!entry) continue
    if (skipped.has(payment.seriesId)) { change(payment.date, entry.accountId, -payment.amountMinor); continue }
    const amountMinor = entry.kind === 'income' ? Math.round(payment.amountMinor * (1 + scenario.incomeChange)) : payment.amountMinor
    const date = entry.kind === 'income' ? addDay(payment.date, scenario.incomeDelayDays ?? 0) : payment.date
    change(payment.date, entry.accountId, -payment.amountMinor)
    change(date, entry.accountId, amountMinor)
    if (date <= (forecast.days.at(-1)?.date ?? '')) payments.push({ ...payment, date, amountMinor })
  }
  const series = [...forecast.series]
  const end = forecast.days.at(-1)?.date ?? forecast.today
  const oneOffs: Array<{ date: string; amountMinor: number }> = []
  const visibleIds = new Set(forecast.accounts.map(account => account.id))
  const unavailableAccounts = new Set([scenario.accountId, scenario.oneOff?.accountId, ...(scenario.events ?? []).map(event => event.accountId)].filter((id): id is string => !!id && !visibleIds.has(id)))
  const events = [...(scenario.events ?? [])]
  if (scenario.oneOff && scenario.oneOff.amountMinor > 0) {
    const date = scenario.oneOff.date < forecast.today ? forecast.today : scenario.oneOff.date
    events.push({ id: 'purchase', name: 'Planned purchase', accountId: scenario.oneOff.accountId ?? payingAccount, kind: 'expense', amountMinor: scenario.oneOff.amountMinor, date, cadence: 'once', endDate: null })
    if (date <= end && visibleIds.has(scenario.oneOff.accountId ?? payingAccount)) oneOffs.push({ date, amountMinor: scenario.oneOff.amountMinor })
  }
  for (const event of events) {
    const account = forecast.accounts.find(account => account.id === event.accountId)
    if (!account) continue
    const id = `plan:${event.id}`
    const amountMinor = event.kind === 'income' ? event.amountMinor : -event.amountMinor
    series.push({ id, accountId: account.id, accountName: account.name, ownerName: account.ownerName, name: event.name, kind: event.kind === 'income' ? 'income' : 'bill', amountMinor, cadence: event.cadence === 'once' ? 'monthly' : event.cadence, categoryId: null, status: 'confirmed', confidence: 'high', occurrences: 0, dayRange: 0, amountRange: 0 })
    for (const date of plannedDates(event, forecast.today, end)) {
      payments.push({ seriesId: id, date, amountMinor })
      change(date, account.id, amountMinor)
    }
  }
  const variableMonthlyMinor = Math.round((scenario.spendingMode === 'budget' && forecast.planning?.budgetMonthlyMinor !== null && forecast.planning?.budgetMonthlyMinor !== undefined ? forecast.planning.budgetMonthlyMinor : forecast.variableMonthlyMinor) * (1 + (scenario.spendingChange ?? 0)))
  const variableDelta = variableMonthlyMinor - forecast.variableMonthlyMinor
  for (const day of forecast.days) {
    if (day.date <= forecast.today || !variableDelta) continue
    const total = Math.max(0, forecast.variableMonthlyMinor)
    for (const account of forecast.accounts) {
      const share = total > 0 ? (forecast.accountFlows?.[account.id]?.variable ?? (account.id === payingAccount ? total : 0)) / total : Number(account.id === payingAccount)
      change(day.date, account.id, -dailyShare(variableDelta * share, day.date))
    }
  }
  const shifts = new Map<string, number>()
  const shiftedAccounts: Record<string, Array<{ date: string; balanceMinor: number }>> = Object.fromEntries(forecast.accounts.map(account => [account.id, []]))
  const days = forecast.days.map((day, index) => {
    for (const [id, delta] of changes.get(day.date) ?? []) shifts.set(id, (shifts.get(id) ?? 0) + delta)
    for (const account of forecast.accounts) {
      const point = forecast.accountDays?.[account.id]?.[index]
      if (point) shiftedAccounts[account.id]!.push({ date: day.date, balanceMinor: Math.round(point.balanceMinor + (shifts.get(account.id) ?? 0)) })
    }
    const shift = [...shifts.values()].reduce((sum, value) => sum + value, 0)
    return { date: day.date, balanceMinor: Math.round(day.balanceMinor + shift), lowMinor: Math.round(day.lowMinor + shift), highMinor: Math.round(day.highMinor + shift) }
  })
  const accounts = forecast.accounts.map(account => {
    const points = shiftedAccounts[account.id]!
    if (!points.length) return account
    const lowest = points.reduce((low, point) => point.balanceMinor < low.balanceMinor ? point : low, points[0]!)
    return { ...account, endMinor: points.at(-1)!.balanceMinor, lowest, weekly: points.filter((_, index) => index % 7 === 0 || index === points.length - 1) }
  })
  const protectedGoals = scenario.protectGoals === false ? [] : forecast.planning?.protectedGoals ?? []
  const accountSafety = accounts.filter(account => account.kind !== 'credit').map(account => {
    const allocatedMinor = protectedGoals.filter(goal => goal.accountId === account.id).reduce((sum, goal) => sum + goal.allocatedMinor, 0)
    const reserveMinor = (account.id === payingAccount ? scenario.minimumReserveMinor ?? 0 : 0) + allocatedMinor
    return { accountId: account.id, name: account.name, projectedMinor: account.lowest.balanceMinor, reserveMinor, availableMinor: account.lowest.balanceMinor - reserveMinor, date: account.lowest.date }
  })
  const safety = accountSafety.find(account => account.accountId === payingAccount) ?? null
  const cashAccounts = accounts.filter(account => account.kind !== 'credit')
  const reservedCashMinor = accountSafety.reduce((sum, account) => sum + account.reserveMinor, 0)
  // Card debt stays in net position. Cash-risk checks remove that debt, while keeping the existing model spread as a conservative cash stress estimate.
  const cashRiskDate = cashAccounts.length ? days.find((day, index) => {
    const cashMinor = cashAccounts.reduce((sum, account) => sum + (shiftedAccounts[account.id]?.[index]?.balanceMinor ?? account.balanceMinor), 0)
    const modelSpreadMinor = day.balanceMinor - day.lowMinor
    return cashMinor - modelSpreadMinor < reservedCashMinor
  })?.date ?? null : null
  const months = summarizeMonths({ today: forecast.today, startMinor: forecast.startMinor, days, payments: payments.filter(payment => payment.seriesId !== 'plan:purchase'), series, variableMonthlyMinor, movedMonthlyMinor: forecast.movedMonthlyMinor, oneOffs })
  payments.sort((a, b) => a.date.localeCompare(b.date) || a.seriesId.localeCompare(b.seriesId))
  return { days, months, payments, series, accounts, accountDays: shiftedAccounts, accountSafety, safety, cashRiskDate, unavailableAccounts: unavailableAccounts.size, variableMonthlyMinor, lowest: lowestOf(days), riskDate: riskDateOf(days) }
}
