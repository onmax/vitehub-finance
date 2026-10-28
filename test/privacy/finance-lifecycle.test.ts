import { and, eq, inArray } from "drizzle-orm"
import { beforeAll, describe, expect, it, vi } from "vitest"
import type { ForecastScenario } from "../../shared/forecast"

vi.mock("vite-hub/database/drizzle", async () => ({ db: (await import("../database")).db }))

const { addAccount, addCategory, addTransaction, db, household, migrate } = await import("../database")
const { budget, budgetVersion, category, financeSetup, financialAccount, forecastPlan, goal, recurring, transaction, transactionReview, user } = await import("../../server/databases/config")
const { erasePeople } = await import("../../server/utils/erase")
const { eraseAccounts, eraseBudgets, remapReviewCategories } = await import("../../server/utils/finance-lifecycle")
const { moveOut } = await import("../../server/utils/membership")

beforeAll(async () => {
  await migrate()
  await db.$client.execute("PRAGMA foreign_keys = OFF")
})
const id = () => crypto.randomUUID()
const scenario = (change: Partial<ForecastScenario> = {}): ForecastScenario => ({ skip: [], incomeChange: 0, oneOff: null, ...change })
async function fixture(name: string) {
  const [owner, partner] = await household(name, [`${name}:owner`, `${name}:partner`])
  if (!owner || !partner) throw new Error("Missing fixture members")
  const account = await addAccount({ householdId: name, ownerId: owner.userId, visibility: "household", balanceMinor: 10000 })
  const groceries = await addCategory(name, "Groceries")
  return { owner, partner, account, groceries }
}
async function makePlan(householdId: string, ownerId: string, input = scenario()) {
  const row = { id: id(), householdId, ownerId, name: "Synthetic plan", visibility: "household", scenario: input } as const
  await db.insert(forecastPlan).values(row)
  return row
}
async function makeBudget(householdId: string, categoryId: string, ownerId: string | null = null) {
  const row = { id: id(), householdId, categoryId, ownerId, amountMinor: 5000 }
  await db.insert(budget).values(row)
  await db.insert(budgetVersion).values({ budgetId: row.id, effectiveMonth: "2026-10", amountMinor: 5000 })
  return row
}

async function makeSeries(householdId: string, accountId: string) {
  const row = { id: id(), householdId, accountId, key: id(), name: "Synthetic series", amountMinor: -1000, currency: "EUR", cadence: "monthly", occurrences: 2, lastDate: "2026-10-01", nextDate: "2026-11-01" } as const
  await db.insert(recurring).values(row)
  return row
}

describe("explicit finance cleanup with foreign keys disabled", () => {
  it("erases new household children and removes deleted-user attribution from surviving records", async () => {
    const [erased] = await household("erase-new", ["erase-new:owner"])
    if (!erased) throw new Error("Missing fixture member")
    const account = await addAccount({ householdId: erased.householdId, ownerId: erased.userId })
    const cat = await addCategory(erased.householdId, "Groceries")
    const charge = await addTransaction(account)
    const limit = await makeBudget(erased.householdId, cat.id)
    const removedPlan = await makePlan(erased.householdId, erased.userId)
    await db.insert(financeSetup).values({ householdId: erased.householdId, userId: erased.userId })
    await db.insert(transactionReview).values({ transactionId: charge.id, assignedTo: erased.userId, reviewedBy: erased.userId, revision: id() })

    const kept = await fixture("erase-kept")
    const keptCharge = await addTransaction(kept.account, { amountMinor: -1234 })
    const reviewedAt = new Date("2026-10-01T12:00:00Z")
    await db.insert(transactionReview).values({ transactionId: keptCharge.id, assignedTo: erased.userId, reviewedBy: erased.userId, reviewedAt, revision: id() })
    await db.insert(financeSetup).values({ householdId: kept.owner.householdId, userId: erased.userId })
    const formerPlan = await makePlan(kept.owner.householdId, erased.userId)
    const keptPlan = await makePlan(kept.owner.householdId, kept.owner.userId)

    await erasePeople([erased.userId])
    expect(await db.select().from(user).where(eq(user.id, erased.userId))).toEqual([])
    expect(await db.select().from(transactionReview).where(eq(transactionReview.transactionId, charge.id))).toEqual([])
    expect(await db.select().from(budgetVersion).where(eq(budgetVersion.budgetId, limit.id))).toEqual([])
    expect(await db.select().from(financeSetup).where(eq(financeSetup.userId, erased.userId))).toEqual([])
    expect(await db.select().from(forecastPlan).where(inArray(forecastPlan.id, [removedPlan.id, formerPlan.id]))).toEqual([])
    expect((await db.select().from(forecastPlan).where(eq(forecastPlan.id, keptPlan.id)))).toHaveLength(1)
    expect((await db.select().from(transactionReview).where(eq(transactionReview.transactionId, keptCharge.id)))[0]).toMatchObject({ assignedTo: null, reviewedBy: null, reviewedAt })
    expect((await db.select().from(transaction).where(eq(transaction.id, keptCharge.id)))[0]?.amountMinor).toBe(-1234)
  })

  it("account removal clears reviews, refund references, dependent plans, and active goal reservations", async () => {
    const { owner, account, groceries } = await fixture("erase-account")
    const kept = await addAccount({ householdId: owner.householdId, ownerId: owner.userId, balanceMinor: 20000 })
    const original = await addTransaction(account, { categoryId: groceries.id })
    const refund = await addTransaction(kept, { amountMinor: 200, categoryId: groceries.id })
    await db.insert(transactionReview).values([{ transactionId: original.id, revision: id() }, { transactionId: refund.id, reimbursementOf: original.id, revision: id() }])
    const series = await makeSeries(owner.householdId, account.id)
    const planRows = [
      await makePlan(owner.householdId, owner.userId, scenario({ accountId: account.id })),
      await makePlan(owner.householdId, owner.userId, scenario({ oneOff: { date: "2026-12-01", amountMinor: 500, accountId: account.id } })),
      await makePlan(owner.householdId, owner.userId, scenario({ events: [{ id: id(), name: "Synthetic event", accountId: account.id, kind: "expense", amountMinor: 100, date: "2026-12-01", cadence: "once", endDate: null }] })),
      await makePlan(owner.householdId, owner.userId, scenario({ skip: [series.id] })),
    ]
    const keptPlan = await makePlan(owner.householdId, owner.userId, scenario({ accountId: kept.id }))
    const allocation = { id: id(), householdId: owner.householdId, name: "Savings", targetMinor: 10000, savedMinor: 5000, accountId: account.id, allocationReviewed: true }
    await db.insert(goal).values(allocation)
    await eraseAccounts([account.id])
    expect(await db.select().from(financialAccount).where(eq(financialAccount.id, account.id))).toEqual([])
    expect(await db.select().from(transaction).where(eq(transaction.id, original.id))).toEqual([])
    expect(await db.select().from(transactionReview).where(eq(transactionReview.transactionId, original.id))).toEqual([])
    expect((await db.select().from(transactionReview).where(eq(transactionReview.transactionId, refund.id)))[0]?.reimbursementOf).toBeNull()
    expect(await db.select().from(forecastPlan).where(inArray(forecastPlan.id, planRows.map(row => row.id)))).toEqual([])
    expect((await db.select().from(forecastPlan).where(eq(forecastPlan.id, keptPlan.id)))).toHaveLength(1)
    expect((await db.select().from(goal).where(eq(goal.id, allocation.id)))[0]).toMatchObject({ accountId: null, savedMinor: 0, allocationReviewed: false })
    expect((await db.select().from(transaction).where(eq(transaction.id, refund.id)))[0]).toMatchObject({ amountMinor: 200, date: refund.date })
    expect((await db.select().from(financialAccount).where(eq(financialAccount.id, kept.id)))[0]?.balanceMinor).toBe(20000)
  })

  it("budget/category deletion removes versions and uncategorizes split parts without losing money", async () => {
    const { owner, account, groceries } = await fixture("erase-category")
    const original = await addTransaction(account, { categoryId: groceries.id, amountMinor: -1000 })
    const limit = await makeBudget(owner.householdId, groceries.id)
    await db.insert(transactionReview).values({ transactionId: original.id, splits: [{ categoryId: groceries.id, amountMinor: -600 }, { categoryId: null, amountMinor: -400 }], revision: id() })
    await eraseBudgets([limit.id])
    await db.update(transaction).set({ categoryId: null, categoryLocked: false }).where(eq(transaction.categoryId, groceries.id))
    await remapReviewCategories(owner.householdId, new Map([[groceries.id, null]]))
    await db.delete(category).where(eq(category.id, groceries.id))
    expect(await db.select().from(budgetVersion).where(eq(budgetVersion.budgetId, limit.id))).toEqual([])
    expect((await db.select().from(transactionReview).where(eq(transactionReview.transactionId, original.id)))[0]?.splits).toEqual([{ categoryId: null, amountMinor: -600 }, { categoryId: null, amountMinor: -400 }])
    expect((await db.select().from(transaction).where(eq(transaction.id, original.id)))[0]).toMatchObject({ amountMinor: -1000, date: original.date, dedupeKey: original.dedupeKey, categoryLocked: true, categorySource: "manual" })
  })

  it("household departure remaps splits and carries personal data without old household references", async () => {
    const { owner: staying, partner: leaving, groceries, account: stayingAccount } = await fixture("move-planning")
    const moving = await addAccount({ householdId: staying.householdId, ownerId: leaving.userId, visibility: "private", balanceMinor: 12345 })
    const custom = await addCategory(staying.householdId, "Custom old category")
    const charge = await addTransaction(moving, { categoryId: groceries.id, amountMinor: -1000 })
    const stayingCharge = await addTransaction(stayingAccount, { categoryId: groceries.id })
    const movingRefund = await addTransaction(moving, { categoryId: groceries.id, amountMinor: 100 })
    const stayingRefund = await addTransaction(stayingAccount, { categoryId: groceries.id, amountMinor: 200 })
    await db.insert(transactionReview).values([
      { transactionId: charge.id, assignedTo: staying.userId, splits: [{ categoryId: groceries.id, amountMinor: -600 }, { categoryId: custom.id, amountMinor: -400 }], revision: id() },
      { transactionId: stayingCharge.id, assignedTo: leaving.userId, revision: id() },
      { transactionId: movingRefund.id, reimbursementOf: stayingCharge.id, revision: id() },
      { transactionId: stayingRefund.id, reimbursementOf: charge.id, revision: id() },
    ])
    const retainedBudget = await makeBudget(staying.householdId, groceries.id, leaving.userId)
    const removedBudget = await makeBudget(staying.householdId, custom.id, leaving.userId)
    const personalGoal = { id: id(), householdId: staying.householdId, ownerId: leaving.userId, name: "Personal", targetMinor: 10000, savedMinor: 1000, accountId: moving.id, allocationReviewed: true }
    const sharedGoal = { ...personalGoal, id: id(), ownerId: null, name: "Shared" }
    const oldAccountGoal = { ...personalGoal, id: id(), accountId: stayingAccount.id }
    await db.insert(goal).values([personalGoal, sharedGoal, oldAccountGoal])
    await db.insert(financeSetup).values({ householdId: staying.householdId, userId: leaving.userId })
    const ownPlan = await makePlan(staying.householdId, leaving.userId, scenario({ accountId: moving.id }))
    const inaccessiblePlan = await makePlan(staying.householdId, leaving.userId, scenario({ accountId: stayingAccount.id }))
    const dependentPlan = await makePlan(staying.householdId, staying.userId, scenario({ accountId: moving.id }))
    const stayingPlan = await makePlan(staying.householdId, staying.userId)

    const fresh = await moveOut(staying.householdId, leaving.userId)
    const [newGroceries] = await db.select().from(category).where(and(eq(category.householdId, fresh), eq(category.name, "Groceries")))
    expect(newGroceries).toBeDefined()
    expect((await db.select().from(transactionReview).where(eq(transactionReview.transactionId, charge.id)))[0]).toMatchObject({ assignedTo: null, splits: [{ categoryId: newGroceries?.id, amountMinor: -600 }, { categoryId: null, amountMinor: -400 }] })
    expect((await db.select().from(transactionReview).where(eq(transactionReview.transactionId, stayingCharge.id)))[0]?.assignedTo).toBeNull()
    for (const row of [movingRefund, stayingRefund]) expect((await db.select().from(transactionReview).where(eq(transactionReview.transactionId, row.id)))[0]?.reimbursementOf).toBeNull()
    expect((await db.select().from(transaction).where(eq(transaction.id, charge.id)))[0]).toMatchObject({ householdId: fresh, amountMinor: -1000, date: charge.date, dedupeKey: charge.dedupeKey, categoryLocked: true })
    expect((await db.select().from(financialAccount).where(eq(financialAccount.id, moving.id)))[0]?.balanceMinor).toBe(12345)
    expect((await db.select().from(budget).where(eq(budget.id, retainedBudget.id)))[0]).toMatchObject({ householdId: fresh, categoryId: newGroceries?.id })
    expect((await db.select().from(budgetVersion).where(eq(budgetVersion.budgetId, retainedBudget.id)))).toHaveLength(1)
    expect(await db.select().from(budgetVersion).where(eq(budgetVersion.budgetId, removedBudget.id))).toEqual([])
    expect((await db.select().from(goal).where(eq(goal.id, personalGoal.id)))[0]).toMatchObject({ householdId: fresh, accountId: moving.id, savedMinor: 1000 })
    expect((await db.select().from(goal).where(eq(goal.id, sharedGoal.id)))[0]).toMatchObject({ householdId: staying.householdId, accountId: null, savedMinor: 0 })
    expect((await db.select().from(goal).where(eq(goal.id, oldAccountGoal.id)))[0]).toMatchObject({ householdId: fresh, accountId: null, savedMinor: 0 })
    expect(await db.select().from(financeSetup).where(eq(financeSetup.userId, leaving.userId))).toEqual([])
    expect((await db.select().from(forecastPlan).where(eq(forecastPlan.id, ownPlan.id)))[0]).toMatchObject({ householdId: fresh, visibility: "private" })
    expect(await db.select().from(forecastPlan).where(inArray(forecastPlan.id, [inaccessiblePlan.id, dependentPlan.id]))).toEqual([])
    expect((await db.select().from(forecastPlan).where(eq(forecastPlan.id, stayingPlan.id)))).toHaveLength(1)
  })
})
