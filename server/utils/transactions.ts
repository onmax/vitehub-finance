import { and, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm"
import { HTTPError } from "h3"
import { db } from "vite-hub/database/drizzle"
import type { Transaction, TransactionPage } from "#shared/api"
import { canEdit, canHide, canSeeTransaction } from "#shared/access"
import { category, financialAccount, transaction, user as users } from "../databases/config"
import { requireAccount, visibleTransactions, type Scope } from "./access"
import { baseCurrency, type Converter } from "./accounts"
import { applyRule, ensureRule, similarMatch, textMatches } from "./categorize"
import { decodeCursor, encodeCursor } from "./cursor"
import { isIsoDate } from "./dates"
import type { Member } from "./identity"
import { detectRecurring } from "./recurring"
import { unpairTransfer } from "./transfers"

export interface TransactionFilters {
  scope?: Scope
  q?: string
  account?: string
  /** A category id, or "none" for uncategorized. */
  category?: string
  from?: string
  to?: string
  direction?: "in" | "out"
  cursor?: string
  limit?: number
}

export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 200

const columns = {
  row: transaction,
  accountName: financialAccount.name,
  ownerId: financialAccount.ownerId,
  visibility: financialAccount.visibility,
  householdPermission: financialAccount.householdPermission,
  ownerName: users.name,
}

/** Transactions the caller may see (the only way this module reads them): visible accounts, without others' hidden rows. */
function selectVisible(who: Pick<Member, "userId" | "householdId">, scope: Scope, where?: SQL) {
  return db
    .select(columns)
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .innerJoin(users, eq(users.id, financialAccount.ownerId))
    .where(and(visibleTransactions(who, scope), where))
}

type Joined = Awaited<ReturnType<typeof selectVisible>>[number]

/**
 * The accounts on the other side of these rows' transfers, by transferId: only accounts the caller may see, and only
 * through a row they may see, so a hidden side never shows up as "To/From <account>" on its partner.
 */
async function transferPartners(who: Pick<Member, "userId" | "householdId">, rows: Joined[]) {
  const ids = [...new Set(rows.map((row) => row.row.transferId).filter((id): id is string => !!id))]
  const partners = new Map<string, Array<{ id: string; accountName: string }>>()
  for (let index = 0; index < ids.length; index += 90) {
    const found = await db
      .select({ id: transaction.id, transferId: transaction.transferId, accountName: financialAccount.name })
      .from(transaction)
      .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
      .where(and(visibleTransactions(who, "household"), inArray(transaction.transferId, ids.slice(index, index + 90))))
    for (const row of found) partners.set(row.transferId!, [...(partners.get(row.transferId!) ?? []), row])
  }
  return (row: Joined) => {
    const other = row.row.transferId ? partners.get(row.row.transferId)?.find((entry) => entry.id !== row.row.id) : undefined
    return other?.accountName ?? null
  }
}

function toTransaction(row: Joined, who: Pick<Member, "userId" | "via">, transferWith: string | null = null): Transaction {
  const t = row.row
  return {
    id: t.id,
    accountId: t.accountId,
    accountName: row.accountName,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    date: t.date,
    amountMinor: t.amountMinor,
    currency: t.currency,
    description: t.description,
    counterparty: t.counterparty,
    categoryId: t.categoryId,
    categorySource: t.categorySource,
    note: t.note,
    status: t.status,
    excluded: t.excluded,
    hidden: t.hidden,
    transferWith,
    canEdit: canEdit(row, who.userId),
    canHide: canHide(row, who.userId) && who.via === "browser",
  }
}

/** The filters as SQL, after checking the account filter is one the caller may see. */
async function filterConditions(who: Member, filters: TransactionFilters) {
  const conditions: SQL[] = []
  if (filters.account) {
    await requireAccount(who, filters.account)
    conditions.push(eq(transaction.accountId, filters.account))
  }
  const q = filters.q?.trim()
  if (q) {
    const pattern = `%${q.toLowerCase().replace(/[\\%_]/g, (char) => `\\${char}`)}%`
    conditions.push(or(textMatches(q), sql`lower(coalesce(${transaction.note}, '')) like ${pattern} escape '\\'`)!)
  }
  if (filters.category === "none") conditions.push(isNull(transaction.categoryId))
  else if (filters.category) conditions.push(eq(transaction.categoryId, filters.category))
  if (filters.from) {
    if (!isIsoDate(filters.from)) throw new HTTPError({ status: 400, statusText: "from must be YYYY-MM-DD." })
    conditions.push(gte(transaction.date, filters.from))
  }
  if (filters.to) {
    if (!isIsoDate(filters.to)) throw new HTTPError({ status: 400, statusText: "to must be YYYY-MM-DD." })
    conditions.push(lte(transaction.date, filters.to))
  }
  if (filters.direction === "in") conditions.push(sql`${transaction.amountMinor} > 0`)
  if (filters.direction === "out") conditions.push(sql`${transaction.amountMinor} < 0`)
  return conditions
}

/** One page of matching transactions, newest first, plus totals over every match. */
export async function searchTransactions(
  who: Member,
  filters: TransactionFilters,
  options: { totals?: boolean } = {},
): Promise<TransactionPage> {
  const scope = filters.scope ?? "household"
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(filters.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT))
  const conditions = await filterConditions(who, filters)
  const cursor = decodeCursor(filters.cursor)
  const after = cursor
    ? or(lt(transaction.date, cursor.date), and(eq(transaction.date, cursor.date), lt(transaction.id, cursor.id)))
    : undefined
  const rows = await selectVisible(who, scope, and(...conditions, after))
    .orderBy(desc(transaction.date), desc(transaction.id))
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  const last = page.at(-1)
  const nextCursor = rows.length > limit && last ? encodeCursor({ date: last.row.date, id: last.row.id }) : null

  let totals = { inMinor: 0, outMinor: 0, count: 0 }
  if (options.totals !== false) {
    const { convert } = await baseCurrency(who)
    totals = await sumMatches(who, scope, and(...conditions), convert)
  }
  const partner = await transferPartners(who, page)
  return { items: page.map((row) => toTransaction(row, who, partner(row))), nextCursor, totals }
}

/** In and out (positive) over the matches, without excluded rows; `count` counts every match the caller may see. */
async function sumMatches(who: Member, scope: Scope, where: SQL | undefined, convert: Converter) {
  const rows = await db
    .select({
      currency: transaction.currency,
      inMinor: sql<number>`coalesce(sum(case when ${transaction.excluded} = 0 and ${transaction.amountMinor} > 0 then ${transaction.amountMinor} else 0 end), 0)`,
      outMinor: sql<number>`coalesce(sum(case when ${transaction.excluded} = 0 and ${transaction.amountMinor} < 0 then -${transaction.amountMinor} else 0 end), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .where(and(visibleTransactions(who, scope), where))
    .groupBy(transaction.currency)
  return rows.reduce(
    (sum, row) => ({
      inMinor: sum.inMinor + convert(Number(row.inMinor), row.currency),
      outMinor: sum.outMinor + convert(Number(row.outMinor), row.currency),
      count: sum.count + Number(row.count),
    }),
    { inMinor: 0, outMinor: 0, count: 0 },
  )
}

export async function getTransaction(who: Member, id: string, scope: Scope = "household") {
  const [row] = await selectVisible(who, scope, eq(transaction.id, id)).limit(1)
  return row ? toTransaction(row, who, (await transferPartners(who, [row]))(row)) : null
}

export interface TransactionChange {
  categoryId?: string | null
  note?: string | null
  excluded?: boolean
  hidden?: boolean
  applyToSimilar?: boolean
}

/**
 * Categorize, annotate, or exclude one transaction on an account the caller may edit. A category picked by hand locks
 * it against rules; `applyToSimilar` also saves a rule and gives the category to similar uncategorized transactions.
 * Hiding it from the household (`hidden`) is the account owner's call, made in the browser: agents and API keys act
 * for the person but never decide who sees what. Someone else's hidden transaction is a 404, like a private account's.
 */
export async function updateTransaction(who: Member, id: string, change: TransactionChange) {
  const [row] = await db
    .select()
    .from(transaction)
    .where(and(eq(transaction.id, id), eq(transaction.householdId, who.householdId)))
    .limit(1)
  const notFound = new HTTPError({ status: 404, statusText: "No such transaction." })
  if (!row) throw notFound
  const account = await requireAccount(who, row.accountId).catch(() => {
    throw notFound
  })
  if (!canSeeTransaction(account, row, who.userId)) throw notFound
  if (!canEdit(account, who.userId)) throw new HTTPError({ status: 403, statusText: "You can view this account but not edit it." })
  if (change.hidden !== undefined && (!canHide(account, who.userId) || who.via !== "browser"))
    throw new HTTPError({ status: 403, statusText: "Only the account's owner can hide its transactions, from the browser." })
  if (change.categoryId) {
    const [found] = await db
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.id, change.categoryId), eq(category.householdId, who.householdId)))
      .limit(1)
    if (!found) throw new HTTPError({ status: 400, statusText: "No such category." })
  }
  const set: Partial<typeof transaction.$inferInsert> = {}
  if (change.categoryId !== undefined)
    Object.assign(set, { categoryId: change.categoryId, categoryLocked: true, categorySource: change.categoryId ? "manual" : null })
  if (change.note !== undefined) set.note = change.note?.trim() || null
  if (change.excluded !== undefined) set.excluded = change.excluded
  if (change.hidden !== undefined) set.hidden = change.hidden
  if (Object.keys(set).length) await db.update(transaction).set(set).where(eq(transaction.id, id))
  // Someone said one side of a detected transfer is something else: the two rows stop being a pair.
  if (change.categoryId !== undefined && row.transferId && !(await isTransferCategory(change.categoryId))) await unpairTransfer(row.transferId)

  if (change.applyToSimilar && change.categoryId) {
    const match = similarMatch(row)
    // Rules are household-wide and every member lists them, so the counterparty of a private account or a hidden
    // transaction never becomes one: similar transactions on the caller's own accounts get the category, and no rule
    // is saved.
    if (match && (account.visibility === "private" || (change.hidden ?? row.hidden)))
      await applyRule(who, match, change.categoryId, { ownOnly: true })
    else if (match) {
      await ensureRule(who.householdId, match, change.categoryId)
      await applyRule(who, match, change.categoryId)
    }
  }
  // Excluding a charge (a duplicate the bank sent) changes which payments repeat; so does hiding one, since recurring
  // payments are seen by everyone who sees the account.
  if ((change.excluded !== undefined && change.excluded !== row.excluded) || (change.hidden !== undefined && change.hidden !== row.hidden))
    await detectRecurring(who.householdId, [row.accountId])
  return (await getTransaction(who, id))!
}

async function isTransferCategory(categoryId: string | null) {
  if (!categoryId) return false
  const [row] = await db.select({ kind: category.kind }).from(category).where(eq(category.id, categoryId)).limit(1)
  return row?.kind === "transfer"
}

/** Category kinds that are not spending or income: moving money between your own accounts. */
const notTransfer = or(isNull(category.kind), ne(category.kind, "transfer"))!

export interface FlowOptions {
  scope: Scope
  from: string
  to: string
  /** Narrows the visible accounts further (a condition on financial_account: kinds, not archived). */
  accounts?: SQL
}

/**
 * Money in and out (both positive) of visible accounts between two dates, in the household's currency, without
 * excluded rows and transfers between accounts.
 */
export async function cashFlow(who: Member, options: FlowOptions, convert: Converter) {
  const rows = await db
    .select({
      currency: transaction.currency,
      inMinor: sql<number>`coalesce(sum(case when ${transaction.amountMinor} > 0 then ${transaction.amountMinor} else 0 end), 0)`,
      outMinor: sql<number>`coalesce(sum(case when ${transaction.amountMinor} < 0 then -${transaction.amountMinor} else 0 end), 0)`,
    })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(flowConditions(who, options))
    .groupBy(transaction.currency)
  return rows.reduce(
    (sum, row) => ({
      inMinor: sum.inMinor + convert(Number(row.inMinor), row.currency),
      outMinor: sum.outMinor + convert(Number(row.outMinor), row.currency),
    }),
    { inMinor: 0, outMinor: 0 },
  )
}

function flowConditions(who: Member, options: FlowOptions) {
  return and(
    visibleTransactions(who, options.scope),
    eq(transaction.excluded, false),
    gte(transaction.date, options.from),
    lte(transaction.date, options.to),
    notTransfer,
    options.accounts,
  )
}

/** What left visible accounts as transfers (positive, household currency): moves the spending totals leave out. */
export async function movedOut(who: Member, options: FlowOptions, convert: Converter) {
  const rows = await db
    .select({ currency: transaction.currency, outMinor: sql<number>`coalesce(sum(-${transaction.amountMinor}), 0)` })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .innerJoin(category, eq(category.id, transaction.categoryId))
    .where(
      and(
        visibleTransactions(who, options.scope),
        eq(transaction.excluded, false),
        gte(transaction.date, options.from),
        lte(transaction.date, options.to),
        eq(category.kind, "transfer"),
        sql`${transaction.amountMinor} < 0`,
        options.accounts,
      ),
    )
    .groupBy(transaction.currency)
  return rows.reduce((sum, row) => sum + convert(Number(row.outMinor), row.currency), 0)
}

/** Outflows per category (positive, household currency) between two dates; `null` is uncategorized. */
export async function spendingByCategory(who: Member, options: FlowOptions, convert: Converter) {
  const totals = new Map<string | null, number>()
  const rows = await db
    .select({
      categoryId: transaction.categoryId,
      currency: transaction.currency,
      outMinor: sql<number>`coalesce(sum(-${transaction.amountMinor}), 0)`,
    })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(and(flowConditions(who, options), sql`${transaction.amountMinor} < 0`))
    .groupBy(transaction.categoryId, transaction.currency)
  for (const row of rows) totals.set(row.categoryId, (totals.get(row.categoryId) ?? 0) + convert(Number(row.outMinor), row.currency))
  return totals
}

/** Money in and out (both positive, household currency) per category between two dates, without transfers. */
export async function flowByCategory(who: Member, options: FlowOptions, convert: Converter) {
  const totals = new Map<string | null, { inMinor: number; outMinor: number }>()
  const rows = await db
    .select({
      categoryId: transaction.categoryId,
      currency: transaction.currency,
      inMinor: sql<number>`coalesce(sum(case when ${transaction.amountMinor} > 0 then ${transaction.amountMinor} else 0 end), 0)`,
      outMinor: sql<number>`coalesce(sum(case when ${transaction.amountMinor} < 0 then -${transaction.amountMinor} else 0 end), 0)`,
    })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(flowConditions(who, options))
    .groupBy(transaction.categoryId, transaction.currency)
  for (const row of rows) {
    const current = totals.get(row.categoryId) ?? { inMinor: 0, outMinor: 0 }
    current.inMinor += convert(Number(row.inMinor), row.currency)
    current.outMinor += convert(Number(row.outMinor), row.currency)
    totals.set(row.categoryId, current)
  }
  return totals
}

/** Raw visible rows for in-memory analysis (forecast's variable spending). */
export async function flowRows(who: Member, options: FlowOptions) {
  return db
    .select({
      accountId: transaction.accountId,
      date: transaction.date,
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
      description: transaction.description,
      counterparty: transaction.counterparty,
    })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(flowConditions(who, options))
}
