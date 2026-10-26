import { and, eq, inArray, isNotNull } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import type { ConnectionSummary, Overview } from "#shared/api"
import { category, connection, financialAccount, user as users } from "../databases/config"
import { visibleAccounts, type Scope } from "./access"
import { balanceHistory, baseCurrency, selectAccounts, type Converter } from "./accounts"
import { addDays, monthEnd, monthLabel, monthOf, monthStart, shiftMonth, todayIso } from "./dates"
import type { Member } from "./identity"
import { listRecurringRows } from "./recurring"
import { cashFlow, searchTransactions, spendingByCategory } from "./transactions"

const UNCATEGORIZED = { categoryId: null, name: "Uncategorized", icon: "i-lucide-circle-help", color: "neutral" }
const SOON = 14 * 24 * 60 * 60 * 1000

export async function overview(who: Member, scope: Scope): Promise<Overview> {
  const { currency, convert } = await baseCurrency(who)
  const today = todayIso()
  const month = monthOf(today)
  const previous = shiftMonth(month, -1)

  const accounts = await selectAccounts(who, scope, eq(financialAccount.archived, false))
  const counted = accounts.filter((row) => row.account.includeInNetWorth)
  const netWorthMinor = counted.reduce((sum, row) => sum + convert(row.account.balanceMinor, row.account.currency), 0)
  const netWorthSeries = await netWorthHistory(
    counted.map((row) => row.account),
    addDays(today, -89),
    today,
    convert,
  )

  const thisMonth = await cashFlow(who, { scope, from: monthStart(month), to: today }, convert)
  const lastMonth = await cashFlow(who, { scope, from: monthStart(previous), to: monthEnd(previous) }, convert)

  const spending = await categorySpending(who, scope, month, convert)

  const soon = addDays(today, 14)
  const upcoming = (await listRecurringRows(who, scope, convert))
    .filter((row) => row.status !== "dismissed" && !row.accountArchived && row.nextDate >= today && row.nextDate <= soon)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .map((row) => row.item)

  const recent = (await searchTransactions(who, { scope, limit: 8 }, { totals: false })).items

  return {
    currency,
    netWorthMinor,
    netWorthSeries,
    month: {
      label: monthLabel(month, "long"),
      inMinor: thisMonth.inMinor,
      outMinor: thisMonth.outMinor,
      previousInMinor: lastMonth.inMinor,
      previousOutMinor: lastMonth.outMinor,
    },
    spending,
    upcoming,
    attention: await needsAttention(who, scope),
    recent,
    accountCount: accounts.length,
  }
}

/** A month's outflows by category, largest first, in the household's currency; uncategorized as "Uncategorized". */
export async function categorySpending(who: Member, scope: Scope, month: string, convert: Converter): Promise<Overview["spending"]> {
  const byCategory = await spendingByCategory(who, { scope, from: monthStart(month), to: monthEnd(month) }, convert)
  const categories = await db.select().from(category).where(eq(category.householdId, who.householdId))
  const known = new Map(categories.map((row) => [row.id, row]))
  return [...byCategory]
    .filter(([, amount]) => amount > 0)
    .map(([id, amountMinor]) => {
      const entry = id ? known.get(id) : undefined
      return entry
        ? { categoryId: entry.id, name: entry.name, icon: entry.icon, color: entry.color, amountMinor }
        : { ...UNCATEGORIZED, amountMinor }
    })
    .sort((a, b) => b.amountMinor - a.amountMinor)
}

/** Per account, the last known balance each day; then the household's sum in its currency at today's rates. */
async function netWorthHistory(
  accounts: Array<{ id: string; currency: string; balanceMinor: number }>,
  from: string,
  to: string,
  convert: Converter,
) {
  const history = await balanceHistory(
    accounts.map((account) => account.id),
    from,
    to,
  )
  const totals = new Map<string, number>()
  for (const account of accounts) {
    const days = history.get(account.id) ?? []
    for (const day of days) {
      // Today is the live balance, whether or not today's snapshot exists yet.
      const value = day.date === to ? account.balanceMinor : day.value
      if (value !== null) totals.set(day.date, (totals.get(day.date) ?? 0) + convert(value, account.currency))
      else totals.set(day.date, totals.get(day.date) ?? 0)
    }
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([date, valueMinor]) => ({ date, valueMinor }))
}

/** Connections feeding visible accounts that failed, expired, or whose bank consent ends within 14 days. */
export async function needsAttention(who: Member, scope: Scope): Promise<ConnectionSummary[]> {
  const feeding = await db
    .select({ connectionId: financialAccount.connectionId })
    .from(financialAccount)
    .where(and(visibleAccounts(who, scope), isNotNull(financialAccount.connectionId)))
  const counts = new Map<string, number>()
  for (const row of feeding) counts.set(row.connectionId!, (counts.get(row.connectionId!) ?? 0) + 1)
  const ids = [...counts.keys()]
  if (!ids.length) return []
  const rows = []
  for (let index = 0; index < ids.length; index += 90)
    rows.push(
      ...(await db
        .select({ connection, ownerName: users.name })
        .from(connection)
        .innerJoin(users, eq(users.id, connection.ownerId))
        .where(and(eq(connection.householdId, who.householdId), inArray(connection.id, ids.slice(index, index + 90))))),
    )
  const limit = Date.now() + SOON
  return rows
    .filter(
      ({ connection: row }) =>
        row.status === "expired" ||
        row.status === "error" ||
        (row.status === "active" && row.consentExpiresAt !== null && row.consentExpiresAt.getTime() <= limit),
    )
    .map(({ connection: row, ownerName }) => ({
      id: row.id,
      provider: row.provider,
      name: row.name,
      institution: row.institution,
      status: row.status,
      ownerId: row.ownerId,
      ownerName,
      consentExpiresAt: row.consentExpiresAt?.toISOString() ?? null,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      lastError: row.lastError,
      accountCount: counts.get(row.id) ?? 0,
      canManage: row.ownerId === who.userId,
    }))
}
