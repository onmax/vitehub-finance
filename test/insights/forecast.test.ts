import { describe, expect, it } from "vitest"
import { fullMonthsBefore, monthlyAverage, projectMonths } from "../../server/utils/forecast-core"
import { occurrencesBetween } from "../../server/utils/recurring-core"

describe("projectMonths", () => {
  const series = [
    { amountMinor: 300000, cadence: "monthly" as const, nextDate: "2026-10-27" }, // salary
    { amountMinor: -95000, cadence: "monthly" as const, nextDate: "2026-11-01" }, // rent
    { amountMinor: -950, cadence: "weekly" as const, nextDate: "2026-10-31" }, // gym
    { amountMinor: -12000, cadence: "yearly" as const, nextDate: "2027-01-15" }, // insurance
  ]

  it("adds each month's recurring charges and variable spending, counting only what's left of this month", () => {
    const months = projectMonths({ today: "2026-10-26", months: 4, startMinor: 100000, series, variableMonthlyMinor: 31000 })
    expect(months.map((month) => month.label)).toEqual(["Oct 2026", "Nov 2026", "Dec 2026", "Jan 2027"])
    // October: 6 of 31 days left; salary on the 27th and one gym visit on the 31st.
    expect(months[0]).toMatchObject({ month: "2026-10", recurringInMinor: 300000, recurringOutMinor: 950, variableOutMinor: 6000, balanceMinor: 393050 })
    // November: rent plus gym on the 7th, 14th, 21st, 28th.
    expect(months[1]).toMatchObject({ recurringInMinor: 300000, recurringOutMinor: 95000 + 4 * 950, variableOutMinor: 31000 })
    expect(months[1]!.balanceMinor).toBe(393050 + 300000 - 98800 - 31000)
    // January: rent, the yearly charge, and five gym visits (2, 9, 16, 23, 30).
    expect(months[3]!.recurringOutMinor).toBe(95000 + 5 * 950 + 12000)
  })

  it("counts occurrences inside a window only", () => {
    expect(occurrencesBetween("2026-10-31", "weekly", "2026-11-01", "2026-11-30")).toEqual(["2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28"])
    expect(occurrencesBetween("2026-01-31", "monthly", "2026-02-01", "2026-04-30")).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"])
    expect(occurrencesBetween("2027-01-15", "yearly", "2026-11-01", "2026-12-31")).toEqual([])
  })

  it("averages the last full months, only those with data", () => {
    expect(fullMonthsBefore("2026-01-10", 3)).toEqual(["2025-10", "2025-11", "2025-12"])
    expect(monthlyAverage(90000, ["2026-07", "2026-08", "2026-09"], "2025-01-01")).toBe(30000)
    expect(monthlyAverage(90000, ["2026-07", "2026-08", "2026-09"], "2026-08-14")).toBe(45000)
    expect(monthlyAverage(0, ["2026-07", "2026-08", "2026-09"], null)).toBe(0)
  })
})
