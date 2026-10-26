import { and, desc, eq, gte, inArray, sql } from "drizzle-orm"
import { HTTPError } from "h3"
import { db } from "vite-hub/database/drizzle"
import type { Recurring, RecurringResponse } from "#shared/api"
import { canEdit } from "#shared/access"
import { formatMoney } from "#shared/money"
import { category, financialAccount, recurring, transaction, user as users } from "../databases/config"
import { requireAccount, visibleAccounts, type Scope } from "./access"
import { baseCurrency, type Converter } from "./accounts"
import { addDays, todayIso } from "./dates"
import type { Member } from "./identity"
import { detectSeries, findInsights, monthlyAmount, nextDueDate, PER_YEAR, seriesKey, WINDOW_DAYS, type RecurringItem } from "./recurring-core"

/**
 * Finds repeating payments in these accounts and upserts their `recurring` rows by `(accountId, key)`. People's
 * choices survive: `status` is never overwritten, and a confirmed series stays even when detection loses it.
 * Runs after every sync (server/utils/sync.ts) and when someone excludes or hides a transaction.
 *
 * Everyone who sees an account sees its recurring payments, so hidden transactions never make a series, and a series
 * with hidden charges that detection no longer finds goes, even a confirmed one.
 */
export async function detectRecurring(householdId: string, accountIds: string[]): Promise<void> {
  const today = todayIso()
  for (let index = 0; index < accountIds.length; index += 80) {
    const accounts = await db
      .select({ id: financialAccount.id, currency: financialAccount.currency })
      .from(financialAccount)
      .where(and(eq(financialAccount.householdId, householdId), inArray(financialAccount.id, accountIds.slice(index, index + 80))))
    for (const account of accounts) await detectAccount(householdId, account, today)
  }
}

async function detectAccount(householdId: string, account: { id: string; currency: string }, today: string) {
  const rows = await db
    .select({
      id: transaction.id,
      date: transaction.date,
      amountMinor: transaction.amountMinor,
      description: transaction.description,
      counterparty: transaction.counterparty,
      categoryId: transaction.categoryId,
      hidden: transaction.hidden,
    })
    .from(transaction)
    .where(and(eq(transaction.accountId, account.id), eq(transaction.excluded, false), gte(transaction.date, addDays(today, -WINDOW_DAYS))))
  const found = detectSeries(rows.filter((row) => !row.hidden), today)
  const hiddenKeys = new Set(rows.filter((row) => row.hidden).map(seriesKey))
  const existing = await db.select().from(recurring).where(eq(recurring.accountId, account.id))
  const byKey = new Map(existing.map((row) => [row.key, row]))

  const inserts: Array<typeof recurring.$inferInsert> = []
  for (const series of found) {
    const values = {
      name: series.name,
      amountMinor: series.amountMinor,
      previousAmountMinor: series.previousAmountMinor,
      currency: account.currency,
      cadence: series.cadence,
      lastDate: series.lastDate,
      nextDate: series.nextDate,
      occurrences: series.occurrences,
      categoryId: series.categoryId,
    }
    const current = byKey.get(series.key)
    if (current) await db.update(recurring).set({ ...values, householdId }).where(eq(recurring.id, current.id))
    else inserts.push({ ...values, id: crypto.randomUUID(), householdId, accountId: account.id, key: series.key })
  }
  // 14 columns a row: six rows stay under D1's 100 bound parameters.
  for (let index = 0; index < inserts.length; index += 6) await db.insert(recurring).values(inserts.slice(index, index + 6))

  const detected = new Set(found.map((series) => series.key))
  const gone = existing.filter((row) => !detected.has(row.key) && (row.status !== "confirmed" || hiddenKeys.has(row.key))).map((row) => row.id)
  for (let index = 0; index < gone.length; index += 90) await db.delete(recurring).where(inArray(recurring.id, gone.slice(index, index + 90)))

  // A confirmed series detection no longer sees keeps its last values, but its next date still moves past today.
  for (const row of existing)
    if (!detected.has(row.key) && row.status === "confirmed" && !gone.includes(row.id) && row.nextDate < today) {
      await db.update(recurring).set({ nextDate: nextDueDate(row.lastDate, row.cadence, today) }).where(eq(recurring.id, row.id))
    }
}

export interface ListedRecurring extends RecurringItem {
  item: Recurring
  accountId: string
  accountArchived: boolean
  nextDate: string
}

/** Recurring rows on the caller's visible accounts, non-dismissed first, the most expensive first. */
export async function listRecurringRows(who: Member, scope: Scope, convert: Converter, id?: string): Promise<ListedRecurring[]> {
  const rows = await db
    .select({
      row: recurring,
      accountName: financialAccount.name,
      accountArchived: financialAccount.archived,
      ownerId: financialAccount.ownerId,
      ownerName: users.name,
    })
    .from(recurring)
    .innerJoin(financialAccount, eq(financialAccount.id, recurring.accountId))
    .innerJoin(users, eq(users.id, financialAccount.ownerId))
    .where(and(visibleAccounts(who, scope), eq(recurring.householdId, who.householdId), id ? eq(recurring.id, id) : undefined))
    .orderBy(desc(recurring.lastDate))
  const listed = rows.map(({ row, accountName, accountArchived, ownerId, ownerName }) => {
    const item: Recurring = {
      id: row.id,
      accountId: row.accountId,
      accountName,
      ownerName,
      name: row.name,
      amountMinor: row.amountMinor,
      previousAmountMinor: row.previousAmountMinor,
      currency: row.currency,
      cadence: row.cadence,
      lastDate: row.lastDate,
      nextDate: row.nextDate,
      occurrences: row.occurrences,
      categoryId: row.categoryId,
      status: row.status,
      monthlyMinor: convert(monthlyAmount(row.amountMinor, row.cadence), row.currency),
    }
    return { ...item, item, key: row.key, ownerId, accountArchived }
  })
  return listed.sort(
    (a, b) =>
      Number(a.status === "dismissed") - Number(b.status === "dismissed") ||
      Math.abs(b.monthlyMinor) - Math.abs(a.monthlyMinor) ||
      a.name.localeCompare(b.name),
  )
}

export async function recurringOverview(who: Member, scope: Scope): Promise<RecurringResponse> {
  const { currency, convert } = await baseCurrency(who)
  const rows = await listRecurringRows(who, scope, convert)
  const active = rows.filter((row) => row.status !== "dismissed")
  const totals = { monthlyOutMinor: 0, yearlyOutMinor: 0, monthlyInMinor: 0 }
  for (const row of active) {
    if (row.amountMinor < 0) {
      totals.monthlyOutMinor -= row.monthlyMinor
      totals.yearlyOutMinor += convert(-row.amountMinor * PER_YEAR[row.cadence], row.currency)
    } else totals.monthlyInMinor += row.monthlyMinor
  }
  const [subscriptions] = await db
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.householdId, who.householdId), sql`lower(${category.name}) = 'subscriptions'`))
    .limit(1)
  const insights = findInsights(rows, {
    currency,
    convert,
    // English like the rest of the UI copy, whatever locale the server process has.
    format: (minor, code) => formatMoney(minor, code, { locale: "en" }),
    subscriptionsCategoryId: subscriptions?.id ?? null,
    largeMonthlyMinor: convert(3000, "EUR"),
  })
  return { currency, items: rows.map((row) => row.item), totals, insights }
}

/** Confirm or dismiss a series on an account the caller may edit. */
export async function updateRecurringStatus(who: Member, id: string, status: Recurring["status"]): Promise<Recurring> {
  const notFound = new HTTPError({ status: 404, statusText: "No such recurring payment." })
  const [row] = await db
    .select({ accountId: recurring.accountId })
    .from(recurring)
    .where(and(eq(recurring.id, id), eq(recurring.householdId, who.householdId)))
    .limit(1)
  if (!row) throw notFound
  const account = await requireAccount(who, row.accountId).catch(() => {
    throw notFound
  })
  if (!canEdit(account, who.userId)) throw new HTTPError({ status: 403, statusText: "You can view this account but not edit it." })
  await db.update(recurring).set({ status }).where(eq(recurring.id, id))
  const { convert } = await baseCurrency(who)
  const [listed] = await listRecurringRows(who, "household", convert, id)
  return listed!.item
}
