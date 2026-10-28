import { and, eq, isNull, lte, or, sql } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import type { Budget, BudgetSuggestion, BudgetsResponse } from "#shared/api"
import { budget, category, financialAccount, transaction } from "../databases/config"
import { budgetVersion } from "../databases/budget-planning"
import { eraseBudgets } from "./finance-lifecycle"
import { visibleTransactions, type Scope } from "./access"
import { baseCurrency, type Converter } from "./accounts"
import { activeBudgetPlan, budgetMonth, suggestionMonths, type MonthlyBudgetPlan } from "./budget-core"
import { isIsoMonth, monthEnd, monthOf, monthStart, shiftMonth, todayIso } from "./dates"
import { HTTPError } from "./http-error"
import type { Member } from "./identity"
import { movedOut, spendingByMonthCategory } from "./transactions"

type BudgetRow = typeof budget.$inferSelect
type MonthSpending = Awaited<ReturnType<typeof spendingByMonthCategory>>

export interface BudgetInput {
  categoryId?: string
  amountMinor?: number
  personal?: boolean
  effectiveMonth?: string
  carryEnabled?: boolean
}

const mine = (who: Member) => and(eq(budget.householdId, who.householdId), or(isNull(budget.ownerId), eq(budget.ownerId, who.userId)))

function versionsFor(row: BudgetRow, versions: (typeof budgetVersion.$inferSelect)[]): MonthlyBudgetPlan[] {
  const own = versions.filter((version) => version.budgetId === row.id)
  return own.length ? own : [{ effectiveMonth: monthOf(row.createdAt.toISOString()), amountMinor: row.amountMinor, carryEnabled: false }]
}

async function history(who: Member, scope: Scope, today: string) {
  const month = sql<string>`substr(${transaction.date}, 1, 7)`
  const rows = await db.select({ month, firstDate: sql<string>`min(${transaction.date})` })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .where(and(visibleTransactions(who, scope), eq(transaction.excluded, false), lte(transaction.date, today)))
    .groupBy(month).orderBy(month)
  return { firstDate: rows[0]?.firstDate ?? null, activity: new Set(rows.map((row) => row.month)) }
}

async function spendingFor(who: Member, scope: Scope, from: string, to: string, convert: Converter) {
  const household = await spendingByMonthCategory(who, { scope, from, to }, convert)
  const personal = scope === "me" ? household : await spendingByMonthCategory(who, { scope: "me", from, to }, convert)
  return { household, personal }
}

function suggestions(spending: MonthSpending, months: string[], expenseIds: Set<string>): BudgetSuggestion[] {
  if (!months.length) return []
  const totals = new Map<string, number>()
  for (const month of months) for (const [id, amount] of spending.get(month) ?? [])
    if (id && expenseIds.has(id)) totals.set(id, (totals.get(id) ?? 0) + amount)
  return [...totals].filter(([, amount]) => amount > 0).map(([categoryId, amount]) => ({
    categoryId, amountMinor: Math.round(amount / months.length), sampleMonths: months,
  }))
}

function toBudget(row: BudgetRow, versions: MonthlyBudgetPlan[], spending: MonthSpending, month: string, today: string): Budget | null {
  const categorySpending = new Map([...spending].map(([key, amounts]) => [key, amounts.get(row.categoryId) ?? 0]))
  const plan = budgetMonth(versions, month, categorySpending, today)
  return plan ? { id: row.id, categoryId: row.categoryId, ownerId: row.ownerId, ...plan, nextChangeMonth: versions.find((version) => version.effectiveMonth > month)?.effectiveMonth ?? null } : null
}

export async function listBudgets(who: Member, scope: Scope, month = monthOf(todayIso())): Promise<BudgetsResponse> {
  const today = todayIso()
  const { currency, convert } = await baseCurrency(who)
  const rows = await db.select().from(budget).where(mine(who))
  const versions = rows.length ? await db.select({ budgetId: budgetVersion.budgetId, effectiveMonth: budgetVersion.effectiveMonth, amountMinor: budgetVersion.amountMinor, carryEnabled: budgetVersion.carryEnabled })
    .from(budgetVersion).innerJoin(budget, eq(budget.id, budgetVersion.budgetId)).where(mine(who)).orderBy(budgetVersion.effectiveMonth) : []
  const beforeMonth = month < monthOf(today) ? month : monthOf(today)
  const sharedHistory = await history(who, scope, today)
  const personalHistory = scope === "me" ? sharedHistory : await history(who, "me", today)
  const sharedMonths = suggestionMonths(beforeMonth, sharedHistory.firstDate, sharedHistory.activity)
  const personalMonths = suggestionMonths(beforeMonth, personalHistory.firstDate, personalHistory.activity)
  let fromMonth = shiftMonth(beforeMonth, -3)
  for (const row of rows) {
    const start = activeBudgetPlan(versionsFor(row, versions), month)?.carryStartMonth
    if (start && start < fromMonth) fromMonth = start
  }
  const spent = await spendingFor(who, scope, monthStart(fromMonth), monthEnd(month), convert)
  const items = rows.flatMap((row) => {
    const item = toBudget(row, versionsFor(row, versions), row.ownerId ? spent.personal : spent.household, month, today)
    return item ? [item] : []
  })
  const scheduled = rows.flatMap((row) => {
    const plans = versionsFor(row, versions)
    const first = plans[0]
    if (!first || first.effectiveMonth <= month) return []
    const item = toBudget(row, plans, new Map(), first.effectiveMonth, today)
    return item ? [item] : []
  }).sort((a, b) => (a.effectiveMonth ?? "").localeCompare(b.effectiveMonth ?? ""))
  const active = items.some((item) => item.ownerId === null) ? items.filter((item) => item.ownerId === null) : items.filter((item) => item.ownerId !== null)
  const budgeted = new Set(active.map((row) => row.categoryId))
  const activeSpending = active[0]?.ownerId ? spent.personal : spent.household
  let unbudgetedMinor = 0
  for (const [categoryId, amount] of activeSpending.get(month) ?? []) if (!categoryId || !budgeted.has(categoryId)) unbudgetedMinor += amount
  const movedMinor = await movedOut(who, { scope, from: monthStart(month), to: monthEnd(month) }, convert)
  const expenseRows = await db.select({ id: category.id }).from(category).where(and(eq(category.householdId, who.householdId), eq(category.kind, "expense")))
  const expenseIds = new Set(expenseRows.map((row) => row.id))
  return { currency, month, items, scheduled, unbudgetedMinor, movedMinor, suggestions: {
    household: suggestions(spent.household, sharedMonths, expenseIds),
    personal: suggestions(spent.personal, personalMonths, expenseIds),
  } }
}

async function requireCategory(who: Member, categoryId: string) {
  const [row] = await db.select({ id: category.id, kind: category.kind }).from(category)
    .where(and(eq(category.id, categoryId), eq(category.householdId, who.householdId))).limit(1)
  if (!row) throw new HTTPError({ status: 400, statusText: "No such category." })
  if (row.kind !== "expense") throw new HTTPError({ status: 400, statusText: "Budgets need an expense category." })
}

async function requireBudget(who: Member, id: string) {
  const [row] = await db.select().from(budget).where(and(eq(budget.id, id), mine(who))).limit(1)
  if (!row) throw new HTTPError({ status: 404, statusText: "No such budget." })
  return row
}

async function refuseDuplicate(who: Member, categoryId: string, ownerId: string | null) {
  const [row] = await db.select({ id: budget.id }).from(budget).where(and(
    eq(budget.householdId, who.householdId), eq(budget.categoryId, categoryId), ownerId ? eq(budget.ownerId, ownerId) : isNull(budget.ownerId),
  )).limit(1)
  if (row) throw new HTTPError({ status: 409, statusText: "That category already has a budget." })
}

function effectiveMonth(input: BudgetInput) {
  const month = input.effectiveMonth ?? monthOf(todayIso())
  if (!isIsoMonth(month)) throw new HTTPError({ status: 400, statusText: "month must be YYYY-MM." })
  if (month < monthOf(todayIso())) throw new HTTPError({ status: 400, statusText: "Budget changes must start this month or later." })
  return month
}

function checkAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new HTTPError({ status: 400, statusText: "A monthly budget must be above zero." })
}

async function withSpending(who: Member, id: string, month: string): Promise<Budget> {
  const response = await listBudgets(who, "household", month)
  const item = response.items.find((item) => item.id === id)
  if (!item) throw new HTTPError({ status: 404, statusText: "No such budget." })
  return item
}

export async function createBudget(who: Member, input: BudgetInput & { categoryId: string; amountMinor: number }) {
  await requireCategory(who, input.categoryId)
  checkAmount(input.amountMinor)
  const month = effectiveMonth(input)
  const ownerId = input.personal ? who.userId : null
  await refuseDuplicate(who, input.categoryId, ownerId)
  const row = { id: crypto.randomUUID(), householdId: who.householdId, ownerId, categoryId: input.categoryId, amountMinor: input.amountMinor }
  try {
    await db.batch([
      db.insert(budget).values(row),
      db.insert(budgetVersion).values({ budgetId: row.id, effectiveMonth: month, amountMinor: input.amountMinor, carryEnabled: input.carryEnabled ?? false }),
    ])
  } catch (cause) {
    await refuseDuplicate(who, input.categoryId, ownerId)
    throw cause
  }
  return withSpending(who, row.id, month)
}

export async function updateBudget(who: Member, id: string, input: BudgetInput) {
  const row = await requireBudget(who, id)
  if ((input.categoryId !== undefined && input.categoryId !== row.categoryId) || (input.personal !== undefined && input.personal !== (row.ownerId !== null)))
    throw new HTTPError({ status: 400, statusText: "Create a new budget to change its category or sharing." })
  const month = effectiveMonth(input)
  const versions = await db.select().from(budgetVersion).where(eq(budgetVersion.budgetId, id)).orderBy(budgetVersion.effectiveMonth)
  const plans = versionsFor(row, versions)
  const previous = activeBudgetPlan(plans, month) ?? plans[0]!
  const amountMinor = input.amountMinor ?? previous.amountMinor
  checkAmount(amountMinor)
  const values = { budgetId: id, effectiveMonth: month, amountMinor, carryEnabled: input.carryEnabled ?? previous.carryEnabled }
  const write = db.insert(budgetVersion).values(values).onConflictDoUpdate({ target: [budgetVersion.budgetId, budgetVersion.effectiveMonth], set: { amountMinor: values.amountMinor, carryEnabled: values.carryEnabled } })
  if (!versions.length && plans[0]!.effectiveMonth < month) {
    await db.batch([db.insert(budgetVersion).values({ budgetId: id, ...plans[0]! }).onConflictDoNothing(), write])
  } else await write
  return withSpending(who, row.id, month)
}

export async function deleteBudget(who: Member, id: string) {
  await requireBudget(who, id)
  await eraseBudgets([id])
}
