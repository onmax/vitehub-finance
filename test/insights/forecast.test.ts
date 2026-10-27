import { describe, expect, it } from "vitest"
import { applyScenario, NO_SCENARIO } from "../../shared/forecast"
import {
  buildForecast,
  combineHistory,
  averagingPeriod,
  fullMonthsBefore,
  regularity,
  upcomingDates,
  type CoreRow,
  type CoreSeries,
  type ForecastInput,
} from "../../server/utils/forecast-core"
import { addDays, addMonths } from "../../server/utils/dates"
import { occurrencesBetween } from "../../server/utils/recurring-core"

const TODAY = "2026-10-26"
const account = (id: string, balanceMinor: number, kind: "checking" | "savings" | "credit" = "checking") => ({
  id,
  name: id,
  ownerName: "Lucía",
  kind,
  balanceMinor,
})
const series = (id: string, amountMinor: number, nextDate: string, extra: Partial<CoreSeries> = {}): CoreSeries => ({
  id,
  accountId: "main",
  accountName: "main",
  ownerName: "Lucía",
  name: id,
  key: `${amountMinor < 0 ? "out" : "in"}:${id}`,
  kind: amountMinor < 0 ? "bill" : "income",
  amountMinor,
  cadence: "monthly",
  nextDate,
  categoryId: null,
  status: "detected",
  ...extra,
})
/** A series' past payments as transactions, monthly back from its next date. */
const paid = (entry: CoreSeries, count: number, amount = (_: number) => entry.amountMinor, jitter = (_: number) => 0): CoreRow[] =>
  Array.from({ length: count }, (_, index) => ({
    accountId: entry.accountId,
    date: addDays(addMonths(entry.nextDate, -(count - index)), jitter(index)),
    amountMinor: amount(index),
    transfer: entry.kind === "transfer",
    key: entry.key,
  }))
/** Everyday spending: one row a day from `from` to yesterday, `perDay(index)` each. */
const spending = (from: string, perDay: (index: number) => number, accountId = "main"): CoreRow[] => {
  const rows: CoreRow[] = []
  for (let date = from, index = 0; date < TODAY; date = addDays(date, 1), index++)
    rows.push({ accountId, date, amountMinor: -perDay(index), transfer: false, key: null })
  return rows
}
const input = (overrides: Partial<ForecastInput>): ForecastInput => ({
  today: TODAY,
  months: 4,
  accounts: [account("main", 100000)],
  series: [],
  rows: [],
  since: "2025-01-01",
  history: [],
  ...overrides,
})

describe("buildForecast", () => {
  const salary = series("salary", 300000, "2026-10-27")
  const rent = series("rent", -95000, "2026-11-01")
  const gym = series("gym", -950, "2026-10-31", { cadence: "weekly" })
  const insurance = series("insurance", -12000, "2027-01-15", { cadence: "yearly" })

  it("counts a refund against spending, not as income", () => {
    const row = (date: string, amountMinor: number, refund = false): CoreRow => ({ accountId: "main", date, amountMinor, transfer: false, refund, key: null })
    // 31,000 spent each month, and 6,000 of September's came back as a refund.
    const rows = [row("2026-07-15", -31000), row("2026-08-15", -31000), row("2026-09-15", -31000), row("2026-09-20", 6000, true)]
    const result = buildForecast(input({ rows }))
    expect(result.variableMonthlyMinor).toBe(29000)
    expect(result.averageMonthlyIncomeMinor).toBe(0)
  })

  it("adds each month's recurring payments and usual spending, counting only what's left of this month", () => {
    // 31,000 a month of everyday spending in July, August, and September.
    const rows = ["2026-07-15", "2026-08-15", "2026-09-15"].map((date) => ({ accountId: "main", date, amountMinor: -31000, transfer: false, key: null }))
    const result = buildForecast(input({ series: [salary, rent, gym, insurance], rows }))
    expect(result.variableMonthlyMinor).toBe(31000)
    expect(result.months.map((month) => month.label)).toEqual(["Oct 2026", "Nov 2026", "Dec 2026", "Jan 2027"])
    // October: 5 of 31 days left after today; salary on the 27th and one gym visit on the 31st.
    expect(result.months[0]).toMatchObject({ month: "2026-10", startMinor: 100000, incomeMinor: 300000, billsMinor: 950, variableOutMinor: 5000 })
    expect(result.months[0]!.balanceMinor).toBe(100000 + 300000 - 950 - 5000)
    // November: rent plus gym on the 7th, 14th, 21st, 28th.
    expect(result.months[1]).toMatchObject({ incomeMinor: 300000, billsMinor: 95000 + 4 * 950, variableOutMinor: 31000 })
    expect(result.months[1]!.balanceMinor).toBe(result.months[0]!.balanceMinor + 300000 - 98800 - 31000)
    expect(result.months[1]!.startMinor).toBe(result.months[0]!.balanceMinor)
    // January: rent, the yearly charge, and five gym visits (2, 9, 16, 23, 30).
    expect(result.months[3]!.billsMinor).toBe(95000 + 5 * 950 + 12000)
    for (const month of result.months) expect(month.netMinor).toBe(month.balanceMinor - month.startMinor)
    // One point a day from today to the end of January, ending where the months end.
    expect(result.days[0]!.date).toBe(TODAY)
    expect(result.days.at(-1)).toMatchObject({ date: "2027-01-31", balanceMinor: result.months[3]!.balanceMinor })
    expect(result.payments.filter((payment) => payment.seriesId === "gym")).toHaveLength(14)
  })

  it("counts occurrences inside a window only", () => {
    expect(occurrencesBetween("2026-10-31", "weekly", "2026-11-01", "2026-11-30")).toEqual(["2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28"])
    expect(occurrencesBetween("2026-01-31", "monthly", "2026-02-01", "2026-04-30")).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"])
    expect(occurrencesBetween("2027-01-15", "yearly", "2026-11-01", "2026-12-31")).toEqual([])
  })

  it("averages the last full months, or the days there is data for", () => {
    expect(fullMonthsBefore("2026-01-10", 3)).toEqual(["2025-10", "2025-11", "2025-12"])
    expect(averagingPeriod(TODAY, "2025-01-01")).toEqual({ from: "2026-07-01", to: "2026-09-30", months: 3 })
    expect(averagingPeriod(TODAY, null)).toMatchObject({ months: 3 })
    // Data from mid-August: those 48 days.
    expect(averagingPeriod(TODAY, "2026-08-14")).toMatchObject({ from: "2026-08-14", to: "2026-09-30" })
    expect(averagingPeriod(TODAY, "2026-08-14").months).toBeCloseTo(48 / 30.4375)
    // Under 4 weeks in full months: up to yesterday instead.
    expect(averagingPeriod(TODAY, "2026-09-20")).toMatchObject({ from: "2026-09-20", to: "2026-10-25" })
    expect(averagingPeriod(TODAY, "2026-10-12")).toMatchObject({ from: "2026-10-12", to: "2026-10-25" })
  })

  it("calls out the lowest point and the first day the range goes below zero", () => {
    // Rent on the 1st takes the balance from 1,000 to 50; the salary on the 27th brings it back.
    const result = buildForecast(
      input({
        accounts: [account("main", 100000)],
        series: [series("salary", 200000, "2026-11-27"), series("rent", -95000, "2026-11-01")],
        rows: spending("2026-04-01", (index) => (index % 7 === 0 ? 20000 : 500)),
        months: 2,
      }),
    )
    expect(result.lowest.date).toBe("2026-11-26")
    expect(result.lowest.balanceMinor).toBe(Math.min(...result.days.map((day) => day.balanceMinor)))
    expect(result.riskDate).not.toBeNull()
    expect(result.days.find((day) => day.date === result.riskDate)!.lowMinor).toBeLessThan(0)
    expect(result.days.filter((day) => day.date < result.riskDate!).every((day) => day.lowMinor >= 0)).toBe(true)
  })

  it("widens the range the further ahead, from nothing today", () => {
    // Spending that moves a lot from week to week: a big shop every other week.
    const result = buildForecast(input({ rows: spending("2026-04-01", (index) => (index % 14 === 0 ? 40000 : 1000)), months: 6 }))
    const width = (day: { lowMinor: number; highMinor: number }) => day.highMinor - day.lowMinor
    expect(width(result.days[0]!)).toBe(0)
    for (let index = 1; index < result.days.length; index++) expect(width(result.days[index]!)).toBeGreaterThanOrEqual(width(result.days[index - 1]!))
    expect(width(result.days.at(-1)!)).toBeGreaterThan(width(result.days[30]!) * 2.5)
    for (const day of result.days) {
      expect(day.lowMinor).toBeLessThanOrEqual(day.balanceMinor)
      expect(day.highMinor).toBeGreaterThanOrEqual(day.balanceMinor)
    }
  })

  it("forecasts from two weeks of data, with a range from a guess, and says how many days it has", () => {
    const result = buildForecast(input({ rows: spending("2026-10-12", () => 3000), since: "2026-10-12", months: 3 }))
    expect(result.dataDays).toBe(15)
    // 3,000 a day for the 14 days up to yesterday: about 91,300 a month.
    expect(result.variableMonthlyMinor).toBe(Math.round(42000 / (14 / 30.4375)))
    // Steady spending, but too few weeks to know: the range is half a week's spending a week.
    const last = result.days.at(-1)!
    expect(last.highMinor).toBeGreaterThan(last.balanceMinor)
    expect(last.balanceMinor - last.lowMinor).toBe(last.highMinor - last.balanceMinor)
  })

  it("cancels moves between projected accounts and counts moves out of them", () => {
    const accounts = [account("main", 500000), account("savings", 100000, "savings")]
    const rows: CoreRow[] = []
    for (const month of ["2026-07", "2026-08", "2026-09"]) {
      // 400 into savings (both projected), 300 to an index fund (not projected).
      rows.push({ accountId: "main", date: `${month}-02`, amountMinor: -40000, transfer: true, key: "out:own" })
      rows.push({ accountId: "savings", date: `${month}-02`, amountMinor: 40000, transfer: true, key: "in:own" })
      rows.push({ accountId: "main", date: `${month}-03`, amountMinor: -30000, transfer: true, key: "out:fund" })
    }
    const result = buildForecast(input({ accounts, rows, months: 2 }))
    expect(result.movedMonthlyMinor).toBe(30000)
    expect(result.variableMonthlyMinor).toBe(0)
    expect(result.months[1]!.movedOutMinor).toBe(30000)
    const main = result.accounts.find((entry) => entry.id === "main")!
    const savings = result.accounts.find((entry) => entry.id === "savings")!
    expect(savings.endMinor).toBeGreaterThan(100000)
    // Each account rounds on its own.
    expect(Math.abs(main.endMinor + savings.endMinor - result.days.at(-1)!.balanceMinor)).toBeLessThanOrEqual(1)
  })

  it("leaves a recurring payment out of the averages, and counts a recurring move as moved", () => {
    const fund = series("fund", -30000, "2026-11-02", { kind: "transfer" })
    const rows = paid(fund, 6)
    const result = buildForecast(input({ series: [fund], rows, months: 2 }))
    expect(result.movedMonthlyMinor).toBe(0)
    expect(result.months[1]!.movedOutMinor).toBe(30000)
    expect(result.months[1]!.billsMinor).toBe(0)
  })

  it("starts the actual balance where today's is", () => {
    const result = buildForecast(input({ history: [{ date: "2026-10-24", balanceMinor: 90000 }, { date: "2026-10-25", balanceMinor: 95000 }] }))
    expect(result.history).toEqual([
      { date: "2026-10-24", balanceMinor: 90000 },
      { date: "2026-10-25", balanceMinor: 95000 },
      { date: TODAY, balanceMinor: 100000 },
    ])
  })
})

describe("regularity", () => {
  it("is sure of a salary on the same day for the same amount", () => {
    const salary = series("salary", 245000, "2026-11-28")
    const rows = paid(salary, 12, (index) => 245000 + (index % 3) * 300, (index) => -(index % 3))
    expect(regularity(salary, rows)).toMatchObject({ confidence: "high", occurrences: 12, dayRange: 2, amountMinor: 245000 })
  })

  it("is less sure of freelance income that moves, and expects its usual amount", () => {
    const freelance = series("freelance", 80000, "2026-11-10")
    const amounts = [72000, 88000, 80000, 76000, 92000, 70000]
    const result = regularity(freelance, paid(freelance, 6, (index) => amounts[index]!, (index) => [0, 4, -3, 2, 5, -1][index]!))
    expect(result.confidence).toBe("medium")
    expect(result.amountMinor).toBe(78000)
    expect(result.amountRange).toBe(0.18)
    expect(result.dayRange).toBeGreaterThan(3)
  })

  it("expects a new price once it's been charged twice, and doesn't count a skipped month as a late payment", () => {
    const streaming = series("streaming", -1599, "2026-11-15")
    const repriced = regularity(streaming, paid(streaming, 8, (index) => (index < 5 ? -1299 : -1599)))
    expect(repriced).toMatchObject({ amountMinor: -1599, amountRange: 0, confidence: "high" })
    const freelance = series("freelance", 65000, "2026-11-10")
    const rows = paid(freelance, 7, () => 65000).filter((_, index) => index !== 3)
    expect(regularity(freelance, rows).dayRange).toBe(0)
  })

  it("isn't sure of a series that lands anywhere in the month", () => {
    const odd = series("odd", -5000, "2026-11-10")
    expect(regularity(odd, paid(odd, 4, () => -5000, (index) => [0, 12, -9, 6][index]!)).confidence).toBe("low")
  })

  it("trusts a yearly charge seen twice, and a confirmed series without history", () => {
    const tax = series("tax", -48632, "2027-10-08", { cadence: "yearly" })
    expect(regularity(tax, [{ date: "2025-10-08", amountMinor: -47180 }, { date: "2026-10-08", amountMinor: -48632 }]).confidence).toBe("high")
    expect(regularity(series("rent", -95000, "2026-11-01", { status: "confirmed" }), []).confidence).toBe("high")
    expect(regularity(series("new", -2000, "2026-11-01"), []).confidence).toBe("low")
  })
})

describe("upcomingDates", () => {
  it("lists a series' payments to the end, and a late one today", () => {
    expect(upcomingDates("2026-10-28", "monthly", TODAY, "2026-12-31")).toEqual(["2026-10-28", "2026-11-28", "2026-12-28"])
    // The salary was due on the 22nd and hasn't come yet: it still comes, today.
    expect(upcomingDates("2026-10-22", "monthly", TODAY, "2026-11-30")).toEqual([TODAY, "2026-11-22"])
    // A month late: that one isn't coming.
    expect(upcomingDates("2026-09-20", "monthly", TODAY, "2026-11-30")).toEqual(["2026-11-20"])
  })
})

describe("combineHistory", () => {
  it("sums accounts per day, holding an account's first balance before it has one", () => {
    expect(
      combineHistory([
        { currentMinor: 0, days: [{ date: "2026-10-24", value: 100 }, { date: "2026-10-25", value: 150 }] },
        { currentMinor: 0, days: [{ date: "2026-10-24", value: null }, { date: "2026-10-25", value: 40 }] },
        { currentMinor: 7, days: [{ date: "2026-10-24", value: null }, { date: "2026-10-25", value: null }] },
      ]),
    ).toEqual([
      { date: "2026-10-24", balanceMinor: 147 },
      { date: "2026-10-25", balanceMinor: 197 },
    ])
  })
})

describe("applyScenario", () => {
  const base = buildForecast(
    input({
      series: [series("salary", 300000, "2026-10-28"), series("rent", -95000, "2026-11-01"), series("streaming", -1599, "2026-11-15")],
      rows: spending("2026-04-01", (index) => (index % 7 === 0 ? 12000 : 2000)),
      months: 3,
    }),
  )
  const forecast = { currency: "EUR", ...base }

  it("changes nothing without a what-if", () => {
    const result = applyScenario(forecast, NO_SCENARIO)
    expect(result.days).toEqual(forecast.days)
    expect(result.months).toEqual(forecast.months)
  })

  it("leaves out a cancelled subscription from its first payment on", () => {
    const result = applyScenario(forecast, { ...NO_SCENARIO, skip: ["streaming"] })
    const at = (date: string) => result.days.find((day) => day.date === date)!.balanceMinor - forecast.days.find((day) => day.date === date)!.balanceMinor
    expect(at("2026-11-14")).toBe(0)
    expect(at("2026-11-15")).toBe(1599)
    expect(at("2026-12-31")).toBe(2 * 1599)
    expect(result.months[1]!.billsMinor).toBe(forecast.months[1]!.billsMinor - 1599)
  })

  it("scales income and keeps the range's width", () => {
    const result = applyScenario(forecast, { ...NO_SCENARIO, incomeChange: -0.1 })
    expect(result.months[1]!.incomeMinor).toBe(270000)
    const last = result.days.at(-1)!
    const before = forecast.days.at(-1)!
    expect(last.balanceMinor).toBe(before.balanceMinor - 3 * 30000)
    expect(last.highMinor - last.lowMinor).toBe(before.highMinor - before.lowMinor)
  })

  it("takes a one-off off every day from its date, and finds the new lowest point", () => {
    const result = applyScenario(forecast, { ...NO_SCENARIO, oneOff: { date: "2026-11-20", amountMinor: 500000 } })
    expect(result.days.find((day) => day.date === "2026-11-19")!.balanceMinor).toBe(forecast.days.find((day) => day.date === "2026-11-19")!.balanceMinor)
    expect(result.days.find((day) => day.date === "2026-11-20")!.balanceMinor).toBe(forecast.days.find((day) => day.date === "2026-11-20")!.balanceMinor - 500000)
    expect(result.months[1]).toMatchObject({ oneOffMinor: 500000 })
    expect(result.months[1]!.netMinor).toBe(forecast.months[1]!.netMinor - 500000)
    expect(result.lowest.balanceMinor).toBe(Math.min(...result.days.map((day) => day.balanceMinor)))
    expect(result.lowest.date >= "2026-11-20").toBe(true)
  })
})
