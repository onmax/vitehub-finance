import { and, eq, inArray, ne, sql, type SQL } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import type { ForecastScenario } from "#shared/forecast"
import { balanceSnapshot, budget, budgetVersion, financeSetup, financialAccount, forecastPlan, goal, holding, recurring, transaction, transactionReview } from "../databases/config"

const chunks = <T>(items: T[], size = 80) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))
const planAccounts = (scenario: ForecastScenario) => [scenario.accountId, scenario.oneOff?.accountId, ...(scenario.events ?? []).map(event => event.accountId)].filter((id): id is string => Boolean(id))

export async function eraseTransactionReviews(where: SQL) {
  const ids = db.select({ id: transaction.id }).from(transaction).where(where)
  await db.update(transactionReview).set({ reimbursementOf: null, revision: crypto.randomUUID() }).where(inArray(transactionReview.reimbursementOf, ids))
  await db.delete(transactionReview).where(inArray(transactionReview.transactionId, ids))
}

export async function eraseBudgets(ids: string[]) {
  for (const part of chunks(ids)) {
    await db.delete(budgetVersion).where(inArray(budgetVersion.budgetId, part))
    await db.delete(budget).where(inArray(budget.id, part))
  }
}

/** Explicit dependents for both account deletion and disconnecting a connection without keeping its accounts. */
export async function eraseAccounts(accountIds: string[]) {
  for (const ids of chunks(accountIds)) {
    const accounts = await db.select({ householdId: financialAccount.householdId }).from(financialAccount).where(inArray(financialAccount.id, ids))
    const households = [...new Set(accounts.map(row => row.householdId))]
    const series = await db.select({ id: recurring.id }).from(recurring).where(inArray(recurring.accountId, ids))
    const removed = new Set(ids)
    const removedSeries = new Set(series.map(row => row.id))
    if (households.length) {
      const plans = await db.select().from(forecastPlan).where(inArray(forecastPlan.householdId, households))
      for (const plan of plans)
        if (planAccounts(plan.scenario).some(id => removed.has(id)) || plan.scenario.skip.some(id => removedSeries.has(id)))
          await db.delete(forecastPlan).where(eq(forecastPlan.id, plan.id))
    }
    await eraseTransactionReviews(inArray(transaction.accountId, ids))
    await db.delete(transaction).where(inArray(transaction.accountId, ids))
    await db.delete(recurring).where(inArray(recurring.accountId, ids))
    await db.delete(holding).where(inArray(holding.accountId, ids))
    await db.delete(balanceSnapshot).where(inArray(balanceSnapshot.accountId, ids))
    await db.update(goal).set({ accountId: null, savedMinor: sql`case when ${goal.completedAt} is null then 0 else ${goal.savedMinor} end`, allocationReviewed: false }).where(inArray(goal.accountId, ids))
    await db.delete(financialAccount).where(inArray(financialAccount.id, ids))
  }
}

/** Splits keep their exact amounts when a category disappears or changes household. */
export async function remapReviewCategories(householdId: string, mapping: Map<string, string | null>) {
  const rows = await db.select({ review: transactionReview }).from(transactionReview)
    .innerJoin(transaction, eq(transaction.id, transactionReview.transactionId)).where(eq(transaction.householdId, householdId))
  for (const { review } of rows) {
    if (!review.splits?.length) continue
    const splits = review.splits.map(part => ({ ...part, categoryId: part.categoryId && mapping.has(part.categoryId) ? mapping.get(part.categoryId) ?? null : part.categoryId }))
    if (JSON.stringify(splits) !== JSON.stringify(review.splits))
      await db.update(transactionReview).set({ splits, revision: crypto.randomUUID() }).where(eq(transactionReview.transactionId, review.transactionId))
    await db.update(transaction).set({ categoryLocked: true, categorySource: "manual", aiGuessId: null }).where(eq(transaction.id, review.transactionId))
  }
}

/** Money moves with its owner; household-specific assignments, links, and setup state do not cross the boundary. */
export async function movePlanningData(oldHousehold: string, freshHousehold: string, userId: string, accountIds: string[], mapping: Map<string, string | null>) {
  await remapReviewCategories(freshHousehold, mapping)
  const oldTransactions = db.select({ id: transaction.id }).from(transaction).where(eq(transaction.householdId, oldHousehold))
  const freshTransactions = db.select({ id: transaction.id }).from(transaction).where(eq(transaction.householdId, freshHousehold))
  await db.update(transactionReview).set({ assignedTo: null, revision: crypto.randomUUID() })
    .where(and(inArray(transactionReview.transactionId, oldTransactions), eq(transactionReview.assignedTo, userId)))
  await db.update(transactionReview).set({ assignedTo: null, revision: crypto.randomUUID() })
    .where(and(inArray(transactionReview.transactionId, freshTransactions), ne(transactionReview.assignedTo, userId)))
  await db.update(transactionReview).set({ reimbursementOf: null, revision: crypto.randomUUID() }).where(sql`exists (
    select 1 from ${transaction} source inner join ${transaction} original on original.id = ${transactionReview.reimbursementOf}
    where source.id = ${transactionReview.transactionId} and source.household_id != original.household_id
    and source.household_id in (${oldHousehold}, ${freshHousehold})
  )`)
  await db.delete(financeSetup).where(and(eq(financeSetup.householdId, oldHousehold), eq(financeSetup.userId, userId)))

  const moved = new Set(accountIds)
  const movedSeries = new Set<string>()
  for (const ids of chunks(accountIds))
    for (const row of await db.select({ id: recurring.id }).from(recurring).where(inArray(recurring.accountId, ids))) movedSeries.add(row.id)
  const plans = await db.select().from(forecastPlan).where(eq(forecastPlan.householdId, oldHousehold))
  for (const plan of plans) {
    const ids = planAccounts(plan.scenario)
    const allMoved = ids.every(id => moved.has(id)) && plan.scenario.skip.every(id => movedSeries.has(id))
    const anyMoved = ids.some(id => moved.has(id)) || plan.scenario.skip.some(id => movedSeries.has(id))
    if (plan.ownerId === userId && allMoved)
      await db.update(forecastPlan).set({ householdId: freshHousehold, visibility: "private", updatedAt: new Date() }).where(eq(forecastPlan.id, plan.id))
    else if (plan.ownerId === userId || anyMoved) await db.delete(forecastPlan).where(eq(forecastPlan.id, plan.id))
  }
}
