import { and, eq, isNull, or } from "drizzle-orm"
import { HTTPError } from "h3"
import { db } from "vite-hub/database/drizzle"
import type { Budget, BudgetsResponse } from "#shared/api"
import { budget, category } from "../databases/config"
import type { Scope } from "./access"
import { baseCurrency, type Converter } from "./accounts"
import { monthEnd, monthOf, monthStart, todayIso } from "./dates"
import type { Member } from "./identity"
import { spendingByCategory } from "./transactions"

type BudgetRow = typeof budget.$inferSelect

/** The household's budgets and the caller's personal ones; other members' personal budgets stay theirs. */
const mine = (who: Member) => and(eq(budget.householdId, who.householdId), or(isNull(budget.ownerId), eq(budget.ownerId, who.userId)))

/**
 * Spending in a month: a household budget counts every visible account (in `scope`); a personal one only the
 * caller's own accounts.
 */
async function spendingFor(who: Member, scope: Scope, month: string, convert: Converter) {
  const range = { from: monthStart(month), to: monthEnd(month) }
  const household = await spendingByCategory(who, { scope, ...range }, convert)
  const personal = scope === "me" ? household : await spendingByCategory(who, { scope: "me", ...range }, convert)
  return { household, personal }
}

const toBudget = (row: BudgetRow, spent: Awaited<ReturnType<typeof spendingFor>>): Budget => ({
  id: row.id,
  categoryId: row.categoryId,
  ownerId: row.ownerId,
  amountMinor: row.amountMinor,
  spentMinor: (row.ownerId ? spent.personal : spent.household).get(row.categoryId) ?? 0,
})

export async function listBudgets(who: Member, scope: Scope, month = monthOf(todayIso())): Promise<BudgetsResponse> {
  const { currency, convert } = await baseCurrency(who)
  const rows = await db.select().from(budget).where(mine(who))
  const spent = await spendingFor(who, scope, month, convert)
  const budgeted = new Set(rows.map((row) => row.categoryId))
  let unbudgetedMinor = 0
  for (const [categoryId, amount] of spent.household) if (!categoryId || !budgeted.has(categoryId)) unbudgetedMinor += amount
  return { currency, month, items: rows.map((row) => toBudget(row, spent)), unbudgetedMinor }
}

async function requireCategory(who: Member, categoryId: string) {
  const [row] = await db
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.id, categoryId), eq(category.householdId, who.householdId)))
    .limit(1)
  if (!row) throw new HTTPError({ status: 400, statusText: "No such category." })
}

async function requireBudget(who: Member, id: string) {
  const [row] = await db
    .select()
    .from(budget)
    .where(and(eq(budget.id, id), mine(who)))
    .limit(1)
  if (!row) throw new HTTPError({ status: 404, statusText: "No such budget." })
  return row
}

/** One budget per category and owner (null owner = the household's). SQLite treats nulls as distinct, so check here. */
async function refuseDuplicate(who: Member, categoryId: string, ownerId: string | null, except?: string) {
  const [row] = await db
    .select({ id: budget.id })
    .from(budget)
    .where(
      and(
        eq(budget.householdId, who.householdId),
        eq(budget.categoryId, categoryId),
        ownerId ? eq(budget.ownerId, ownerId) : isNull(budget.ownerId),
      ),
    )
    .limit(1)
  if (row && row.id !== except) throw new HTTPError({ status: 409, statusText: "That category already has a budget." })
}

async function withSpending(who: Member, row: BudgetRow) {
  const { convert } = await baseCurrency(who)
  return toBudget(row, await spendingFor(who, "household", monthOf(todayIso()), convert))
}

export async function createBudget(who: Member, input: { categoryId: string; amountMinor: number; personal?: boolean }) {
  await requireCategory(who, input.categoryId)
  const ownerId = input.personal ? who.userId : null
  await refuseDuplicate(who, input.categoryId, ownerId)
  const [row] = await db
    .insert(budget)
    .values({ id: crypto.randomUUID(), householdId: who.householdId, ownerId, categoryId: input.categoryId, amountMinor: input.amountMinor })
    .returning()
  return withSpending(who, row!)
}

export async function updateBudget(
  who: Member,
  id: string,
  input: { categoryId?: string; amountMinor?: number; personal?: boolean },
) {
  const row = await requireBudget(who, id)
  const categoryId = input.categoryId ?? row.categoryId
  const ownerId = input.personal === undefined ? row.ownerId : input.personal ? who.userId : null
  if (input.categoryId) await requireCategory(who, input.categoryId)
  await refuseDuplicate(who, categoryId, ownerId, id)
  const [updated] = await db
    .update(budget)
    .set({ categoryId, ownerId, amountMinor: input.amountMinor ?? row.amountMinor })
    .where(eq(budget.id, id))
    .returning()
  return withSpending(who, updated!)
}

export async function deleteBudget(who: Member, id: string) {
  await requireBudget(who, id)
  await db.delete(budget).where(eq(budget.id, id))
}
