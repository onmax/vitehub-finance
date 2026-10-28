import { and, eq, inArray, min } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import type { PlanningForecast } from "#shared/planning"
import { category, connection, financialAccount, transaction } from "../databases/config"
import { visibleTransactions, type Scope } from "./access"
import { balanceHistory, baseCurrency, selectAccounts } from "./accounts"
import { addDays, todayIso } from "./dates"
import { buildForecast, combineHistory, averagingPeriod, type CoreAccount } from "./forecast-core"
import type { Member } from "./identity"
import { seriesKey, WINDOW_DAYS } from "./recurring-core"
import { listRecurringRows } from "./recurring"
import { flowRows } from "./transactions"
import { listGoals } from "./goals"
import { listBudgets } from "./budgets"
import { ratesWithTime } from "./fx"

/** The accounts money is spent from: what the forecast starts with and projects. */
const LIQUID_KINDS = ["checking", "savings", "cash", "credit"] as const
const liquid = and(
  eq(financialAccount.archived, false),
  eq(financialAccount.includeInNetWorth, true),
  inArray(financialAccount.kind, [...LIQUID_KINDS]),
)!

/**
 * The caller's cash (checking, savings, cash, and credit accounts in net worth) projected day by day: the recurring
 * series they see (not dismissed) when they fall due, plus the usual spending and moves from the last 3 full months,
 * with a likely range around it (server/utils/forecast-core.ts). Everything reads through `visibleAccounts` and
 * `visibleTransactions`: another member's private accounts and hidden transactions never shape it.
 */
export async function forecast(who: Member, scope: Scope, months: number): Promise<PlanningForecast> {
  const { currency, convert } = await baseCurrency(who)
  const today = todayIso()
  const rows = (await selectAccounts(who, scope, liquid)).filter(row => row.provider !== "stripe")
  const accounts: CoreAccount[] = rows.map((row) => ({
    id: row.account.id,
    name: row.account.name,
    ownerName: row.ownerName,
    kind: row.account.kind as CoreAccount["kind"],
    balanceMinor: convert(row.account.balanceMinor, row.account.currency),
  }))
  const accountIds = new Set(accounts.map((account) => account.id))

  const kinds = new Map(
    (await db.select({ id: category.id, kind: category.kind }).from(category).where(eq(category.householdId, who.householdId))).map((row) => [
      row.id,
      row.kind,
    ]),
  )
  const series = (await listRecurringRows(who, scope, convert))
    .filter((row) => row.status !== "dismissed" && accountIds.has(row.accountId))
    .map((row) => ({
      id: row.id,
      accountId: row.accountId,
      accountName: row.accountName,
      ownerName: row.ownerName,
      name: row.name,
      key: row.key,
      kind: row.categoryId && kinds.get(row.categoryId) === "transfer" ? ("transfer" as const) : row.amountMinor >= 0 ? ("income" as const) : ("bill" as const),
      amountMinor: convert(row.amountMinor, row.currency),
      cadence: row.cadence,
      nextDate: row.nextDate,
      categoryId: row.categoryId,
      status: row.status as "detected" | "confirmed",
    }))

  const transactions = accountIds.size ? await flowRows(who, { scope, from: addDays(today, -WINDOW_DAYS), to: today, accounts: liquid, includeTransfers: true }) : []
  const [oldest] = await db
    .select({ date: min(transaction.date) })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .where(and(visibleTransactions(who, scope), liquid))

  // The actual balance for about half as long as the forecast looks ahead, at least 45 days and at most 180.
  const historyDays = Math.min(180, Math.max(45, Math.round((months * 30.4) / 2)))
  const balances = await balanceHistory([...accountIds], addDays(today, -historyDays), addDays(today, -1))
  const history = combineHistory(
    rows.map((row) => ({
      currentMinor: convert(row.account.balanceMinor, row.account.currency),
      days: (balances.get(row.account.id) ?? []).map((day) => ({
        date: day.date,
        value: day.value === null ? null : convert(day.value, row.account.currency),
      })),
    })),
  )

  const [goals, budgets, fx, connections] = await Promise.all([
    listGoals(who), listBudgets(who, scope), ratesWithTime(currency),
    db.select({ id: connection.id, lastSyncedAt: connection.lastSyncedAt }).from(connection).where(eq(connection.householdId, who.householdId)),
  ])
  const syncTimes = new Map(connections.map(item => [item.id, item.lastSyncedAt]))
  // A personal and household budget for the same category overlap. Use the larger allocation.
  const categoryBudgets = new Map<string, number>()
  for (const item of budgets.items) categoryBudgets.set(item.categoryId, Math.max(categoryBudgets.get(item.categoryId) ?? 0, item.amountMinor))
  const perMonth = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }
  const recurringBudgeted = series.filter(item => item.kind === 'bill' && item.categoryId && categoryBudgets.has(item.categoryId)).reduce((sum, item) => sum + Math.abs(item.amountMinor) * perMonth[item.cadence], 0)
  const budgetTotal = [...categoryBudgets.values()].reduce((sum, amount) => sum + amount, 0)
  const period = averagingPeriod(today, oldest?.date ?? null)
  const recurringKeys = new Set(series.map(item => `${item.accountId}|${item.key}`))
  const unbudgetedMinor = transactions.filter(row => row.date >= period.from && row.date <= period.to && row.categoryKind !== 'transfer' && (!row.categoryId || !categoryBudgets.has(row.categoryId)) && !recurringKeys.has(`${row.accountId}|${seriesKey(row)}`)).reduce((sum, row) => sum + (row.amountMinor < 0 || row.categoryKind === 'expense' ? -convert(row.amountMinor, row.currency) : 0), 0) / period.months
  return {
    currency,
    planning: {
      accounts: rows.map(({ account }) => ({
        id: account.id, name: account.name, currency: account.currency,
        balanceUpdatedAt: account.balanceUpdatedAt?.toISOString() ?? null,
        syncAt: account.connectionId ? syncTimes.get(account.connectionId)?.toISOString() ?? null : null,
        fx: account.currency === currency ? 'same' : !fx.rates[account.currency] ? 'missing' : Date.now() - fx.at > 24 * 60 * 60 * 1000 ? 'stale' : 'current',
      })),
      fxAt: fx.at ? new Date(fx.at).toISOString() : null,
      reconstructedHistory: true,
      protectedGoals: goals.flatMap(goal => !goal.completedAt && !goal.fundingUnavailable && !goal.allocationNeedsReview && goal.accountId && accountIds.has(goal.accountId) ? [{ id: goal.id, name: goal.name, accountId: goal.accountId, allocatedMinor: goal.progressMinor, monthlyNeededMinor: goal.monthlyNeededMinor ?? 0 }] : []),
      budgetMonthlyMinor: budgets.items.length ? Math.max(0, Math.round(budgetTotal - recurringBudgeted + unbudgetedMinor)) : null,
    },
    ...buildForecast({
      today,
      months,
      accounts,
      series,
      rows: transactions.map((row) => ({
        transactionId: row.transactionId,
        accountId: row.accountId,
        date: row.date,
        amountMinor: convert(row.amountMinor, row.currency),
        transfer: row.categoryKind === "transfer",
        refund: row.amountMinor > 0 && row.categoryKind === "expense",
        key: row.date <= today ? seriesKey(row) : null,
      })),
      since: oldest?.date ?? null,
      history,
    }),
  }
}
