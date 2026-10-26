import { describe, expect, it } from "vitest"
import { DEMO_BUDGETS, demoScenario } from "../../server/demo/scenario"
import { DEFAULT_CATEGORIES } from "../../shared/categories"
import { detectSeries, findInsights, monthlyAmount, type RecurringItem } from "../../server/utils/recurring-core"

const TODAY = "2026-10-26"

/** What detection finds in each demo account, as the recurring page would list it. */
function recurringItems(today: string) {
  const scenario = demoScenario(today)
  const items: RecurringItem[] = []
  for (const account of scenario.accounts) {
    const rows = scenario.transactions
      .filter((row) => row.account === account.key)
      .map((row, index) => ({ ...row, id: `${account.key}-${index}`, categoryId: row.category }))
    for (const series of detectSeries(rows, today))
      items.push({
        id: `${account.key}:${series.key}`,
        key: series.key,
        ownerId: account.owner,
        ownerName: account.owner,
        accountName: account.name,
        name: series.name,
        amountMinor: series.amountMinor,
        previousAmountMinor: series.previousAmountMinor,
        currency: "EUR",
        cadence: series.cadence,
        categoryId: series.categoryId,
        status: series.categoryId === "Transfers" ? "dismissed" : "detected",
        monthlyMinor: monthlyAmount(series.amountMinor, series.cadence),
      })
  }
  return items
}

const insightsOf = (today: string) =>
  findInsights(recurringItems(today), {
    currency: "EUR",
    convert: (minor) => minor,
    format: (minor) => `€${(minor / 100).toFixed(2)}`,
    subscriptionsCategoryId: "Subscriptions",
    largeMonthlyMinor: 3000,
  })

describe("demoScenario", () => {
  it("is the same household for the same date, and a different one the next day", () => {
    expect(demoScenario(TODAY)).toEqual(demoScenario(TODAY))
    expect(demoScenario("2026-10-27").transactions).not.toEqual(demoScenario(TODAY).transactions)
  })

  it("covers 13 months up to today and nothing after", () => {
    const { transactions, start } = demoScenario(TODAY)
    expect(start <= "2025-09-26").toBe(true)
    expect(transactions.every((row) => row.date >= start && row.date <= TODAY)).toBe(true)
    expect(transactions.length).toBeGreaterThan(600)
  })

  it("only uses the default categories", () => {
    const names = new Set(DEFAULT_CATEGORIES.map((entry) => entry.name))
    const used = new Set(demoScenario(TODAY).transactions.map((row) => row.category).filter(Boolean))
    for (const name of used) expect(names.has(name!)).toBe(true)
  })

  for (const today of [TODAY, "2026-11-01", "2027-01-15", "2027-06-30", "2027-08-10"])
    it(`shows Netflix's price increase and the Spotify both pay on ${today}`, () => {
      const insights = insightsOf(today)
      expect(insights.find((insight) => insight.kind === "price_increase")).toMatchObject({ title: "Netflix went up 23%" })
      const duplicates = insights.filter((insight) => insight.kind === "duplicate")
      expect(duplicates.map((insight) => insight.title)).toEqual(["Spotify is paid twice"])
      expect(recurringItems(today).filter((item) => item.key === "out:spotify").map((item) => item.ownerId).sort()).toEqual(["lucia", "pablo"])
    })

  for (const today of [TODAY, "2026-11-01", "2027-02-03", "2027-08-12", "2027-12-27"])
    it(`puts eating out over its budget and shopping near it on ${today}`, () => {
      const scenario = demoScenario(today)
      const visible = new Set(scenario.accounts.filter((account) => account.visibility === "household").map((account) => account.key))
      const spent = (category: string) =>
        scenario.transactions
          .filter((row) => row.category === category && row.amountMinor < 0 && row.date.startsWith(today.slice(0, 7)) && visible.has(row.account))
          .reduce((sum, row) => sum - row.amountMinor, 0)
      const ratio = (category: string) => spent(category) / DEMO_BUDGETS.find((entry) => entry.category === category)!.amountMinor
      expect(ratio("Eating out")).toBeGreaterThan(1)
      expect(ratio("Shopping")).toBeGreaterThanOrEqual(0.8)
      expect(ratio("Shopping")).toBeLessThan(0.9)
      for (const category of ["Groceries", "Transport", "Subscriptions"]) expect(ratio(category)).toBeLessThan(0.9)
    })

  for (const today of [TODAY, "2027-03-15", "2027-08-12"])
    it(`never overdraws a bank account on ${today}`, () => {
      const scenario = demoScenario(today)
      for (const account of scenario.accounts.filter((entry) => entry.kind === "checking" || entry.kind === "savings")) {
        const rows = scenario.transactions.filter((row) => row.account === account.key)
        let balance = account.balanceMinor - rows.reduce((sum, row) => sum + row.amountMinor, 0)
        for (const row of rows) {
          balance += row.amountMinor
          expect(balance, `${account.name} on ${row.date}`).toBeGreaterThanOrEqual(0)
        }
      }
    })

  it("keeps the private accounts' names out of the shared accounts' statements", () => {
    const scenario = demoScenario(TODAY)
    const shared = scenario.transactions.filter((row) => !["vault", "savings-lucia"].includes(row.account))
    for (const row of shared) expect(`${row.description} ${row.counterparty ?? ""} ${row.note ?? ""}`).not.toMatch(/vault|ahorro personal/i)
  })

  it("has the story's accounts, goals, and an expiring bank consent", () => {
    const scenario = demoScenario(TODAY)
    expect(scenario.accounts.find((account) => account.key === "fund")!.balanceMinor).toBeGreaterThan(1_170_000)
    expect(scenario.accounts.filter((account) => account.visibility === "private").map((account) => [account.owner, account.name])).toEqual([
      ["lucia", "Ahorro personal"],
      ["pablo", "Vault"],
    ])
    expect(scenario.connections.find((entry) => entry.name === "BBVA")!.consentDays).toBe(9)
    expect(scenario.goals.map((entry) => entry.name)).toEqual(["Viaje a Japón", "Fondo de emergencia", "Bici nueva"])
    expect(scenario.goals[0]!.targetDate).toBe("2027-10-31")
    expect(scenario.holdings[0]).toMatchObject({ symbol: "BTC" })
  })
})
