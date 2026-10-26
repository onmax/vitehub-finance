import { and, asc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import type { AccountDetail, AccountSummary } from "#shared/api"
import { canEdit, canManage } from "#shared/access"
import { ACCOUNT_KINDS, balanceSnapshot, connection, financialAccount, holding, householdSettings, user as users } from "../databases/config"
import { visibleAccounts, type Scope } from "./access"
import { addDays, todayIso } from "./dates"
import { converterTo } from "./fx"
import type { Member } from "./identity"
import { carryForward } from "./series"

export type Converter = Awaited<ReturnType<typeof converterTo>>
export type AccountRow = typeof financialAccount.$inferSelect

/** The currency every total is shown in. */
export async function householdCurrency(householdId: string) {
  const [row] = await db
    .select({ currency: householdSettings.currency })
    .from(householdSettings)
    .where(eq(householdSettings.householdId, householdId))
    .limit(1)
  return row?.currency ?? "EUR"
}

/** The household's currency and a converter into it: what every total needs. */
export async function baseCurrency(who: Pick<Member, "householdId">) {
  const currency = await householdCurrency(who.householdId)
  return { currency, convert: await converterTo(currency) }
}

const accountColumns = {
  account: financialAccount,
  ownerName: users.name,
  provider: connection.provider,
  connectionStatus: connection.status,
}

/** Visible accounts with their owner's name and connection, for any extra condition. */
export function selectAccounts(who: Pick<Member, "userId" | "householdId">, scope: Scope, where?: SQL) {
  return db
    .select(accountColumns)
    .from(financialAccount)
    .innerJoin(users, eq(users.id, financialAccount.ownerId))
    .leftJoin(connection, eq(connection.id, financialAccount.connectionId))
    .where(and(visibleAccounts(who, scope), where))
}

type Joined = Awaited<ReturnType<typeof selectAccounts>>[number]

export function toSummary(row: Joined, who: Pick<Member, "userId">, convert: Converter): AccountSummary {
  const account = row.account
  return {
    id: account.id,
    name: account.name,
    institution: account.institution,
    kind: account.kind,
    currency: account.currency,
    balanceMinor: account.balanceMinor,
    balanceBaseMinor: convert(account.balanceMinor, account.currency),
    iban: account.iban,
    ownerId: account.ownerId,
    ownerName: row.ownerName,
    visibility: account.visibility,
    householdPermission: account.householdPermission,
    includeInNetWorth: account.includeInNetWorth,
    archived: account.archived,
    connectionId: account.connectionId,
    provider: row.provider ?? null,
    connectionStatus: row.connectionStatus ?? null,
    balanceUpdatedAt: account.balanceUpdatedAt ? account.balanceUpdatedAt.toISOString() : null,
    canEdit: canEdit(account, who.userId),
    canManage: canManage(account, who.userId),
  }
}

const kindOrder = (kind: string) => ACCOUNT_KINDS.indexOf(kind as (typeof ACCOUNT_KINDS)[number])

export const sortAccounts = (a: AccountSummary, b: AccountSummary) =>
  kindOrder(a.kind) - kindOrder(b.kind) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)

export async function listAccounts(
  who: Pick<Member, "userId" | "householdId">,
  options: { scope?: Scope; archived?: boolean } = {},
): Promise<AccountSummary[]> {
  const { convert } = await baseCurrency(who)
  const rows = await selectAccounts(who, options.scope ?? "household", options.archived ? undefined : eq(financialAccount.archived, false))
  return rows.map((row) => toSummary(row, who, convert)).sort(sortAccounts)
}

/** One visible account as a summary, or null (callers answer 404). */
export async function accountSummary(who: Pick<Member, "userId" | "householdId">, accountId: string) {
  const { convert } = await baseCurrency(who)
  const [row] = await selectAccounts(who, "household", eq(financialAccount.id, accountId)).limit(1)
  return row ? toSummary(row, who, convert) : null
}

/** Daily balances per account from `from` to `to`, carrying the last value over days without a snapshot. */
export async function balanceHistory(accountIds: string[], from: string, to = todayIso()) {
  const series = new Map<string, Array<{ date: string; value: number | null }>>()
  for (let index = 0; index < accountIds.length; index += 50) {
    const ids = accountIds.slice(index, index + 50)
    const inWindow = await db
      .select({ accountId: balanceSnapshot.accountId, date: balanceSnapshot.date, balanceMinor: balanceSnapshot.balanceMinor })
      .from(balanceSnapshot)
      .where(and(inArray(balanceSnapshot.accountId, ids), gte(balanceSnapshot.date, from)))
      .orderBy(asc(balanceSnapshot.date))
    // SQLite returns the other columns of the row that holds max(date): each account's last balance before the window.
    const before = await db
      .select({ accountId: balanceSnapshot.accountId, balanceMinor: balanceSnapshot.balanceMinor, date: sql<string>`max(${balanceSnapshot.date})` })
      .from(balanceSnapshot)
      .where(and(inArray(balanceSnapshot.accountId, ids), lt(balanceSnapshot.date, from)))
      .groupBy(balanceSnapshot.accountId)
    const initial = new Map(before.map((row) => [row.accountId, row.balanceMinor]))
    for (const id of ids)
      series.set(
        id,
        carryForward(
          inWindow.filter((row) => row.accountId === id),
          from,
          to,
          initial.get(id) ?? null,
        ),
      )
  }
  return series
}

export async function accountDetail(who: Pick<Member, "userId" | "householdId">, accountId: string): Promise<AccountDetail | null> {
  const summary = await accountSummary(who, accountId)
  if (!summary) return null
  const holdings = await db
    .select({ symbol: holding.symbol, name: holding.name, quantity: holding.quantity, priceMinor: holding.priceMinor, valueMinor: holding.valueMinor })
    .from(holding)
    .where(eq(holding.accountId, accountId))
  holdings.sort((a, b) => b.valueMinor - a.valueMinor)
  const today = todayIso()
  const days = (await balanceHistory([accountId], addDays(today, -179), today)).get(accountId) ?? []
  const history = days.flatMap((day) => (day.value === null ? [] : [{ date: day.date, balanceMinor: day.value }]))
  // An account without snapshots still shows today's balance.
  if (!history.length) history.push({ date: today, balanceMinor: summary.balanceMinor })
  return { ...summary, holdings, history }
}
