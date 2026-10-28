import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("vite-hub/database/drizzle", async () => ({ db: (await import("../database")).db }))
vi.mock("vite-hub/kv", async () => ({ kv: (await import("../database")).kv }))
vi.mock("#vitehub/env/server", () => ({ useServerEnv: () => ({}) }))

const { addAccount, addCategory, addTransaction, db, household, kv, migrate } = await import("../database")
const { budget, category } = await import("../../server/databases/config")
const { budgetVersion } = await import("../../server/databases/budget-planning")
const { createBudget, listBudgets, updateBudget } = await import("../../server/utils/budgets")
const { updateTransaction } = await import("../../server/utils/transactions")
const { budgetMonth, suggestionMonths } = await import("../../server/utils/budget-core")
const { eq } = await import("drizzle-orm")

beforeAll(async () => {
  await migrate()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"))
  await kv.set("fx:EUR", { at: Date.now(), rates: { EUR: 1 } })
})
afterAll(() => vi.useRealTimers())

async function setup(id: string) {
  const [owner, partner] = await household(id, [`${id}-owner`, `${id}-partner`])
  if (!owner || !partner) throw new Error("Fixture needs two people")
  const account = await addAccount({ householdId: id, ownerId: owner.userId, visibility: "household" })
  const groceries = await addCategory(id, "Groceries")
  return { owner, partner, account, groceries }
}

describe("monthly budgets", () => {
  it("keeps historical limits when a legacy budget changes, and starts carry only when enabled", async () => {
    const { owner, account, groceries } = await setup("budget-history")
    await db.insert(budget).values({ id: "legacy-budget", householdId: owner.householdId, categoryId: groceries.id, amountMinor: 10_000, createdAt: new Date("2026-07-01T00:00:00Z") })
    await addTransaction(account, { date: "2026-09-10", categoryId: groceries.id, amountMinor: -8_000 })
    await addTransaction(account, { date: "2026-10-10", categoryId: groceries.id, amountMinor: -3_000 })
    const changed = await updateBudget(owner, "legacy-budget", { amountMinor: 15_000, carryEnabled: true })
    expect(changed).toMatchObject({ amountMinor: 15_000, carriedMinor: 0, carryStartMonth: "2026-10", availableMinor: 15_000 })
    const september = await listBudgets(owner, "household", "2026-09")
    expect(september.items[0]).toMatchObject({ amountMinor: 10_000, spentMinor: 8_000, carryEnabled: false, availableMinor: 10_000 })
    const november = await listBudgets(owner, "household", "2026-11")
    expect(november.items[0]).toMatchObject({ amountMinor: 15_000, carriedMinor: 12_000, availableMinor: 27_000 })
    await updateBudget(owner, "legacy-budget", { amountMinor: 20_000, effectiveMonth: "2026-11" })
    expect((await listBudgets(owner, "household", "2026-10")).items[0]).toMatchObject({ amountMinor: 15_000, nextChangeMonth: "2026-11" })
    expect((await listBudgets(owner, "household", "2026-09")).items[0]?.amountMinor).toBe(10_000)
  })

  it("does not invent a budget before its starting month and never carries overspending as debt", async () => {
    const { owner, account, groceries } = await setup("budget-start")
    const created = await createBudget(owner, { categoryId: groceries.id, amountMinor: 10_000, carryEnabled: true })
    await addTransaction(account, { date: "2026-10-10", categoryId: groceries.id, amountMinor: -12_000 })
    expect((await listBudgets(owner, "household", "2026-09")).items).toEqual([])
    expect((await listBudgets(owner, "household", "2026-11")).items[0]).toMatchObject({ carriedMinor: 0, availableMinor: 10_000 })
    await updateBudget(owner, created.id, { effectiveMonth: "2026-11", carryEnabled: false })
    await updateBudget(owner, created.id, { effectiveMonth: "2026-12", carryEnabled: true })
    expect((await listBudgets(owner, "household", "2026-12")).items[0]).toMatchObject({ carriedMinor: 0, carryStartMonth: "2026-12" })
  })

  it("rejects retroactive changes and changes that would mix category or sharing history", async () => {
    const { owner, groceries } = await setup("budget-validation")
    const created = await createBudget(owner, { categoryId: groceries.id, amountMinor: 10_000 })
    await expect(updateBudget(owner, created.id, { effectiveMonth: "2026-09", amountMinor: 20_000 })).rejects.toThrow("Budget changes must start this month or later.")
    await expect(updateBudget(owner, created.id, { personal: true })).rejects.toThrow("Create a new budget to change its category or sharing.")
    const other = await addCategory(owner.householdId, "Other")
    await expect(updateBudget(owner, created.id, { categoryId: other.id })).rejects.toThrow("Create a new budget to change its category or sharing.")
    await db.update(category).set({ kind: "income" }).where(eq(category.id, other.id))
    await expect(createBudget(owner, { categoryId: other.id, amountMinor: 100 })).rejects.toThrow("Budgets need an expense category.")
    await expect(createBudget(owner, { categoryId: groceries.id, amountMinor: 0 })).rejects.toThrow("A monthly budget must be above zero.")
  })

  it("suggests only completed months with known visible activity and excludes transfers, excluded rows and private spending", async () => {
    const { owner, partner, account, groceries } = await setup("budget-suggestions")
    const personal = await addAccount({ householdId: owner.householdId, ownerId: owner.userId, visibility: "private" })
    const transfer = await addCategory(owner.householdId, "Transfer")
    await db.update(category).set({ kind: "transfer" }).where(eq(category.id, transfer.id))
    await addTransaction(account, { date: "2026-07-15", categoryId: groceries.id, amountMinor: -900_000 })
    await addTransaction(account, { date: "2026-08-01", categoryId: groceries.id, amountMinor: -1_000 })
    await addTransaction(account, { date: "2026-09-01", categoryId: groceries.id, amountMinor: -3_000 })
    await addTransaction(account, { date: "2026-10-01", categoryId: groceries.id, amountMinor: -90_000 })
    await addTransaction(account, { date: "2026-09-02", categoryId: groceries.id, amountMinor: -80_000, excluded: true })
    await addTransaction(account, { date: "2026-09-03", categoryId: groceries.id, amountMinor: -70_000, hidden: true })
    await addTransaction(personal, { date: "2026-09-03", categoryId: groceries.id, amountMinor: -60_000 })
    await addTransaction(account, { date: "2026-09-03", categoryId: transfer.id, amountMinor: -50_000 })
    const result = await listBudgets(partner, "household")
    expect(result.suggestions?.household).toEqual([{ categoryId: groceries.id, amountMinor: 2_000, sampleMonths: ["2026-08", "2026-09"] }])
    expect(result.suggestions?.personal).toEqual([])
  })

  it("reports transparent straight-line pacing only for the current month", async () => {
    const { owner, account, groceries } = await setup("budget-pace")
    const created = await createBudget(owner, { categoryId: groceries.id, amountMinor: 31_000 })
    await addTransaction(account, { date: "2026-10-10", categoryId: groceries.id, amountMinor: -8_000 })
    expect((await listBudgets(owner, "household")).items[0]).toMatchObject({ expectedSpendMinor: 16_000, projectedSpendMinor: 15_500 })
    expect((await listBudgets(owner, "household", "2026-11")).items[0]).toMatchObject({ expectedSpendMinor: null, projectedSpendMinor: null })
    expect((await db.select().from(budgetVersion).where(eq(budgetVersion.budgetId, created.id))).length).toBe(1)
  })

  it("nets category splits and refunds once in both monthly spending and carry", async () => {
    const { owner, account, groceries } = await setup("budget-split-refund")
    const home = await addCategory(owner.householdId, "Home")
    await createBudget(owner, { categoryId: groceries.id, amountMinor: 10_000, carryEnabled: true })
    const purchase = await addTransaction(account, { date: "2026-10-03", amountMinor: -10_000, categoryId: home.id })
    await updateTransaction(owner, purchase.id, { splits: [{ categoryId: groceries.id, amountMinor: -6_000 }, { categoryId: home.id, amountMinor: -4_000 }] })
    await addTransaction(account, { date: "2026-10-05", amountMinor: 1_000, categoryId: groceries.id })
    const october = await listBudgets(owner, "household")
    expect(october.items[0]).toMatchObject({ spentMinor: 5_000, carriedMinor: 0 })
    expect(october.unbudgetedMinor).toBe(4_000)
    expect((await listBudgets(owner, "household", "2026-11")).items[0]).toMatchObject({ carriedMinor: 5_000, availableMinor: 15_000 })
  })

  it("keeps personal budgets private and prevents simultaneous duplicate household budgets", async () => {
    const { owner, partner, groceries } = await setup("budget-duplicates")
    const personal = await createBudget(owner, { categoryId: groceries.id, amountMinor: 5_000, personal: true })
    expect((await listBudgets(partner, "household")).items).toEqual([])
    await expect(updateBudget(partner, personal.id, { amountMinor: 6_000 })).rejects.toMatchObject({ status: 404 })
    const results = await Promise.allSettled([
      createBudget(owner, { categoryId: groceries.id, amountMinor: 10_000 }),
      createBudget(partner, { categoryId: groceries.id, amountMinor: 20_000 }),
    ])
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    expect(results.find((result) => result.status === "rejected")?.reason).toMatchObject({ status: 409 })
    expect((await listBudgets(partner, "household")).items).toHaveLength(1)
  })

  it("keeps future budgets discoverable without counting them as current spending limits", async () => {
    const { owner, groceries } = await setup("budget-future")
    const created = await createBudget(owner, { categoryId: groceries.id, amountMinor: 10_000, effectiveMonth: "2026-12", carryEnabled: true })
    const current = await listBudgets(owner, "household")
    expect(current.items).toEqual([])
    expect(current.scheduled).toEqual([expect.objectContaining({ id: created.id, effectiveMonth: "2026-12", availableMinor: 10_000 })])
    expect((await listBudgets(owner, "household", "2026-12")).scheduled).toEqual([])
  })
})

describe("carry and history boundaries", () => {
  it("accumulates positive leftovers using each month's amount and resets on disable", () => {
    const plans = [
      { effectiveMonth: "2026-07", amountMinor: 10_000, carryEnabled: true },
      { effectiveMonth: "2026-08", amountMinor: 20_000, carryEnabled: true },
      { effectiveMonth: "2026-10", amountMinor: 30_000, carryEnabled: false },
      { effectiveMonth: "2026-11", amountMinor: 40_000, carryEnabled: true },
    ]
    const spending = new Map([["2026-07", 8_000], ["2026-08", 5_000]])
    expect(budgetMonth(plans, "2026-09", spending, "2026-09-15")).toMatchObject({ carriedMinor: 17_000, availableMinor: 37_000 })
    expect(budgetMonth(plans, "2026-10", spending, "2026-10-15")).toMatchObject({ carriedMinor: 0 })
    expect(budgetMonth(plans, "2026-11", spending, "2026-10-15")).toMatchObject({ carriedMinor: 0, carryStartMonth: "2026-11" })
    expect(budgetMonth(plans, "2026-06", spending, "2026-10-15")).toBeNull()
  })

  it("does not turn missing history or a partial first month into zero-spend samples", () => {
    expect(suggestionMonths("2026-10", "2026-07-15", new Set(["2026-07", "2026-09"]))).toEqual(["2026-09"])
    expect(suggestionMonths("2026-10", null, new Set())).toEqual([])
  })
})
