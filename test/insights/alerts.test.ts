import { describe, expect, it } from "vitest"
import type { Budget, ConnectionSummary, ForecastDay } from "../../shared/api"
import { budgetAlerts, connectionAlerts, defaultAlertSettings, largePaymentAlerts, lowBalanceAlert, mergeAlertSettings, sortAlerts } from "../../server/utils/alerts-core"

const settings = defaultAlertSettings("EUR")
const budget = (spentMinor: number, amountMinor = 40_000): Budget => ({ id: "b1", categoryId: "groceries", ownerId: null, amountMinor, spentMinor })
const day = (date: string, balanceMinor: number): ForecastDay => ({ date, balanceMinor, lowMinor: balanceMinor, highMinor: balanceMinor })

describe("alerts", () => {
  it("alerts a budget at its threshold, and again, more urgently, once it's over", () => {
    expect(budgetAlerts([budget(35_000)], settings, "EUR", "2026-10", "2026-10-27")).toEqual([])
    const near = budgetAlerts([budget(36_000)], settings, "EUR", "2026-10", "2026-10-27")
    const over = budgetAlerts([budget(41_000)], settings, "EUR", "2026-10", "2026-10-27")
    expect(near.map((alert) => [alert.severity, alert.key])).toEqual([["info", "budget:b1:2026-10:near"]])
    expect(over.map((alert) => [alert.severity, alert.key])).toEqual([["warning", "budget:b1:2026-10:over"]])
  })

  it("alerts the first day in the next 30 the balance goes under the threshold", () => {
    const days = [day("2026-10-27", -500), day("2026-11-03", 20_000), day("2026-11-10", -1_000), day("2026-11-12", -9_000)]
    const [alert] = lowBalanceAlert(days, settings, "EUR", "2026-10-27")
    expect(alert).toMatchObject({ date: "2026-11-10", severity: "critical", key: "low_balance:2026-11:0" })
    expect(lowBalanceAlert([day("2026-12-20", -1)], settings, "EUR", "2026-10-27")).toEqual([])
    expect(lowBalanceAlert(days, { ...settings, lowBalance: { enabled: true, thresholdMinor: 50_000 } }, "EUR", "2026-10-27")[0]).toMatchObject({ date: "2026-11-03", severity: "warning" })
  })

  it("alerts payments over the amount in the household's currency, and nothing once it's off", () => {
    const payment = (id: string, baseMinor: number) => ({ id, date: "2026-10-20", description: "Ikea", account: "Revolut", amountMinor: -baseMinor, currency: "EUR", baseMinor })
    expect(largePaymentAlerts([payment("a", 49_999), payment("b", 50_000)], settings).map((alert) => alert.key)).toEqual(["transaction:b"])
    expect(largePaymentAlerts([payment("b", 90_000)], { ...settings, largeTransaction: { enabled: false, thresholdMinor: 1 } })).toEqual([])
  })

  it("makes a new connection alert when a renewed consent runs out again", () => {
    const connection = (consentExpiresAt: string) => ({ id: "c1", status: "active", consentExpiresAt, lastSyncedAt: null }) as ConnectionSummary
    const [first] = connectionAlerts([connection("2026-11-05T10:00:00.000Z")], "2026-10-27")
    const [second] = connectionAlerts([connection("2027-02-03T10:00:00.000Z")], "2026-10-27")
    expect(first!.severity).toBe("warning")
    expect(first!.key).not.toBe(second!.key)
    expect(connectionAlerts([{ ...connection("2026-11-05T10:00:00.000Z"), status: "expired" }], "2026-10-27")[0]!.severity).toBe("critical")
  })

  it("keeps saved settings and fills in ones added later", () => {
    expect(mergeAlertSettings({ budget: { enabled: false, percent: 75 } }, "SEK")).toMatchObject({ currency: "SEK", budget: { enabled: false, percent: 75 }, largeTransaction: { thresholdMinor: 50_000 } })
  })

  it("puts the most urgent first, then the newest", () => {
    const sorted = sortAlerts([
      { severity: "info", date: "2026-10-26" },
      { severity: "critical", date: "2026-10-01" },
      { severity: "info", date: "2026-10-27" },
    ] as const)
    expect(sorted.map((alert) => `${alert.severity} ${alert.date}`)).toEqual(["critical 2026-10-01", "info 2026-10-27", "info 2026-10-26"])
  })
})
