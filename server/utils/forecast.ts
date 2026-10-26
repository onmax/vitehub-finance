import { and, eq, inArray, min } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import type { Forecast } from "#shared/api"
import { financialAccount, transaction } from "../databases/config"
import { visibleAccounts, type Scope } from "./access"
import { baseCurrency, selectAccounts } from "./accounts"
import { monthEnd, monthStart, todayIso } from "./dates"
import { fullMonthsBefore, monthlyAverage, projectMonths } from "./forecast-core"
import type { Member } from "./identity"
import { seriesKey } from "./recurring-core"
import { listRecurringRows } from "./recurring"
import { flowRows } from "./transactions"

/** The accounts money is spent from: what the forecast starts with and projects. */
const LIQUID_KINDS = ["checking", "savings", "cash", "credit"] as const
const liquid = and(
  eq(financialAccount.archived, false),
  eq(financialAccount.includeInNetWorth, true),
  inArray(financialAccount.kind, [...LIQUID_KINDS]),
)!

/**
 * Today's cash, then month by month: recurring payments when they fall due, plus the usual variable spending (the
 * average of the last 3 full months' outflows that don't belong to a recurring series). Transfers between accounts
 * and excluded rows don't count. Income and savings averages come from the same 3 months' actual money in and out.
 */
export async function forecast(who: Member, scope: Scope, months: number): Promise<Forecast> {
  const { currency, convert } = await baseCurrency(who)
  const today = todayIso()
  const accounts = await selectAccounts(who, scope, liquid)
  const accountIds = new Set(accounts.map((row) => row.account.id))
  const startMinor = accounts.reduce((sum, row) => sum + convert(row.account.balanceMinor, row.account.currency), 0)

  const recurringRows = (await listRecurringRows(who, scope, convert)).filter((row) => row.status !== "dismissed")
  const series = recurringRows
    .filter((row) => accountIds.has(row.accountId))
    .map((row) => ({ amountMinor: convert(row.amountMinor, row.currency), cadence: row.cadence, nextDate: row.nextDate }))
  const recurringKeys = new Set(recurringRows.map((row) => `${row.accountId}|${row.key}`))

  const window = fullMonthsBefore(today, 3)
  const rows = await flowRows(who, { scope, from: monthStart(window[0]!), to: monthEnd(window.at(-1)!), accounts: liquid })
  let variable = 0
  let income = 0
  let spent = 0
  for (const row of rows) {
    const amount = convert(row.amountMinor, row.currency)
    if (amount > 0) income += amount
    else {
      spent -= amount
      if (!recurringKeys.has(`${row.accountId}|${seriesKey(row)}`)) variable -= amount
    }
  }
  const [oldest] = await db
    .select({ date: min(transaction.date) })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .where(and(visibleAccounts(who, scope), liquid, eq(transaction.householdId, who.householdId)))
  const since = oldest?.date ?? null
  const variableMonthlyMinor = monthlyAverage(variable, window, since)
  const averageMonthlyIncomeMinor = monthlyAverage(income, window, since)
  const averageMonthlyOutMinor = monthlyAverage(spent, window, since)

  return {
    currency,
    startMinor,
    months: projectMonths({ today, months, startMinor, series, variableMonthlyMinor }),
    variableMonthlyMinor,
    averageMonthlyIncomeMinor,
    monthlySavingsMinor: averageMonthlyIncomeMinor - averageMonthlyOutMinor,
  }
}
