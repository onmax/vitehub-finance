import { and, asc, eq, inArray, isNotNull } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import type { ConnectionSummary, Overview } from "#shared/api"
import { category, connection, financialAccount, stakingPosition, user as users } from "../databases/config"
import { visibleAccounts, type Scope } from "./access"
import { balanceHistory, baseCurrency, selectAccounts, type Converter } from "./accounts"
import { bankLogos } from "./bank-logos"
import { lastErrorFor } from "./connections"
import { addDays, eachDay, monthEnd, monthLabel, monthOf, monthStart, shiftMonth, todayIso } from "./dates"
import type { Member } from "./identity"
import { listRecurringRows } from "./recurring"
import { stakingView } from "./staking"
import { netWorthSeries } from "./series"
import { cashFlow, cashFlowSeries, searchTransactions, spendingByCategory } from "./transactions"

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

  const monthSeries = await cashFlowSeries(who, { scope, from: monthStart(month), to: today }, convert)
  const thisMonth = monthSeries.at(-1) ?? { inMinor: 0, outMinor: 0 }
  const previousThrough = `${previous}-${String(Math.min(Number(today.slice(8)), Number(monthEnd(previous).slice(8)))).padStart(2, "0")}`
  const lastMonth = await cashFlow(who, { scope, from: monthStart(previous), to: previousThrough }, convert)

  const spending = await categorySpending(who, scope, month, convert)

  const soon = addDays(today, 14)
  const upcoming = (await listRecurringRows(who, scope, convert))
    .filter((row) => row.status !== "dismissed" && !row.accountArchived && row.nextDate >= today && row.nextDate <= soon)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .map((row) => row.item)

  const recent = (await searchTransactions(who, { scope, limit: 8 }, { totals: false })).items

  // Staking on the accounts in view: what's staked and the rewards identified (without another member's hidden ones), in
  // the household's currency at today's price. Both are already inside net worth; this only says how much of it is staked.
  const staked = accounts.length
    ? await db.select({ accountId: stakingPosition.accountId }).from(stakingPosition).where(inArray(stakingPosition.accountId, accounts.map((row) => row.account.id)))
    : []
  const staking: Overview["staking"] = []
  for (const { accountId } of staked) {
    const account = accounts.find((row) => row.account.id === accountId)!.account
    const view = await stakingView(who, account, account.currency)
    if (!view) continue
    const inHousehold = (minor: number | null | undefined) => (minor === null || minor === undefined ? null : convert(minor, account.currency))
    staking.push({
      accountId,
      accountName: account.name,
      symbol: view.symbol,
      staked: view.amounts.staked,
      stakedValueMinor: inHousehold(view.values?.staked),
      rewards: view.amounts.rewards,
      validatorListed: view.validatorListed,
    })
  }

  return {
    currency,
    netWorthMinor,
    netWorthSeries,
    month: {
      month,
      label: monthLabel(month, "long"),
      series: monthSeries,
      inMinor: thisMonth.inMinor,
      outMinor: thisMonth.outMinor,
      previousInMinor: lastMonth.inMinor,
      previousOutMinor: lastMonth.outMinor,
    },
    spending,
    upcoming,
    attention: await needsAttention(who, scope),
    recent,
    staking,
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

/**
 * Per account, the last known balance each day in the household's currency at today's rates; then their sum, with an
 * account that appears inside the window held at its first balance before it (`netWorthSeries`).
 */
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
  const dates = eachDay(from, to)
  const values = accounts.map((account) => {
    const days = new Map((history.get(account.id) ?? []).map((day) => [day.date, day.value]))
    // Today is the live balance, whether or not today's snapshot exists yet.
    return dates.map((date) => {
      const value = date === to ? account.balanceMinor : (days.get(date) ?? null)
      return value === null ? null : convert(value, account.currency)
    })
  })
  const firstKnown = dates.findIndex((_, day) => values.some((account) => account[day] !== null))
  return firstKnown === -1 ? [] : netWorthSeries(dates, values).slice(firstKnown)
}

/** Connections feeding visible accounts that failed, expired, or whose bank consent ends within 14 days. */
export async function needsAttention(who: Member, scope: Scope): Promise<ConnectionSummary[]> {
  const feeding = await db
    .select({ id: financialAccount.id, name: financialAccount.name, connectionId: financialAccount.connectionId })
    .from(financialAccount)
    .where(and(visibleAccounts(who, scope), isNotNull(financialAccount.connectionId)))
    .orderBy(asc(financialAccount.name))
  const counts = new Map<string, Array<{ id: string; name: string }>>()
  for (const row of feeding) counts.set(row.connectionId!, [...(counts.get(row.connectionId!) ?? []), { id: row.id, name: row.name }])
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
  const logoOf = await bankLogos(rows.map(({ connection: row }) => row))
  const failing = rows.filter(
    ({ connection: row }) =>
      row.status === "expired" ||
      row.status === "error" ||
      (row.status === "active" && row.consentExpiresAt !== null && row.consentExpiresAt.getTime() <= limit),
  )
  return Promise.all(
    failing.map(async ({ connection: row, ownerName }) => ({
      id: row.id,
      provider: row.provider,
      name: row.name,
      institution: row.institution,
      logo: row.provider === "enable_banking" ? logoOf(row) : null,
      status: row.status,
      ownerId: row.ownerId,
      ownerName,
      consentExpiresAt: row.consentExpiresAt?.toISOString() ?? null,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      lastError: await lastErrorFor(who, row),
      lastErrorCode: row.lastErrorCode,
      accounts: counts.get(row.id) ?? [],
      canManage: row.ownerId === who.userId,
    })),
  )
}
