import { and, eq, gte, inArray, min } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import type { Forecast } from "#shared/api"
import { category, financialAccount, transaction } from "../databases/config"
import { visibleTransactions, type Scope } from "./access"
import { balanceHistory, baseCurrency, selectAccounts } from "./accounts"
import { addDays, todayIso } from "./dates"
import { buildForecast, combineHistory, type CoreAccount } from "./forecast-core"
import type { Member } from "./identity"
import { seriesKey, WINDOW_DAYS } from "./recurring-core"
import { listRecurringRows } from "./recurring"

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
export async function forecast(who: Member, scope: Scope, months: number): Promise<Forecast> {
  const { currency, convert } = await baseCurrency(who)
  const today = todayIso()
  const rows = await selectAccounts(who, scope, liquid)
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

  const transactions = accountIds.size
    ? await db
        .select({
          accountId: transaction.accountId,
          date: transaction.date,
          amountMinor: transaction.amountMinor,
          currency: transaction.currency,
          description: transaction.description,
          counterparty: transaction.counterparty,
          kind: category.kind,
        })
        .from(transaction)
        .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
        .leftJoin(category, eq(category.id, transaction.categoryId))
        .where(and(visibleTransactions(who, scope), liquid, eq(transaction.excluded, false), gte(transaction.date, addDays(today, -WINDOW_DAYS))))
    : []
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

  return {
    currency,
    ...buildForecast({
      today,
      months,
      accounts,
      series,
      rows: transactions.map((row) => ({
        accountId: row.accountId,
        date: row.date,
        amountMinor: convert(row.amountMinor, row.currency),
        transfer: row.kind === "transfer",
        refund: row.amountMinor > 0 && row.kind === "expense",
        key: row.date <= today ? seriesKey(row) : null,
      })),
      since: oldest?.date ?? null,
      history,
    }),
  }
}
