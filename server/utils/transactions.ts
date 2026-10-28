import { HTTPError } from "./http-error"
import { and, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm"

import { db } from "vite-hub/database/drizzle"
import { kv } from "vite-hub/kv"
import * as v from "valibot"
import type { TransactionBulkResult } from "#shared/review"
import { transactionReview } from "../databases/review"
import { Minor } from "./input"
import type { Transaction, TransactionPage } from "#shared/api"
import { canEdit, canHide, canSeeTransaction } from "#shared/access"
import { category, financialAccount, member, transaction, user as users } from "../databases/config"
import { requireAccount, visibleTransactions, type Scope } from "./access"
import { baseCurrency, type Converter } from "./accounts"
import { applyRule, ensureRule, textMatches } from "./categorize"
import { similarMatch } from "./rule-suggestions-core"
import { decodeCursor, encodeCursor } from "./cursor"
import { eachDay, isIsoDate } from "./dates"
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
  /** Leave excluded transactions out of the page; `totals.excluded` counts them. */
  review?: "needs-review" | "assigned-to-me"
  hideExcluded?: boolean
  cursor?: string
  limit?: number
}

export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 200

const columns = {
  row: transaction,
  review: transactionReview,
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
    .leftJoin(transactionReview, eq(transactionReview.transactionId, transaction.id))
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

function toTransaction(row: Joined, who: Pick<Member, "userId" | "via">, transferWith: string | null = null, reimbursementOf: string | null = null) {
  const t = row.row
  return {
    id: t.id,
    accountId: t.accountId,
    accountName: row.accountName,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    date: t.date,
    amountMinor: t.amountMinor,
    ...(t.payment ? { payment: t.payment } : {}),
    currency: t.currency,
    description: t.description,
    counterparty: t.counterparty,
    categoryId: t.categoryId,
    categorySource: t.categorySource,
    aiGuessId: !t.categoryId && canEdit(row, who.userId) ? t.aiGuessId : null,
    note: t.note,
    status: t.status,
    excluded: t.excluded,
    hidden: t.hidden,
    transferWith,
    review: {
      reviewedAt: row.review?.reviewedAt?.toISOString() ?? null,
      reviewedBy: row.review?.reviewedBy ?? null,
      assignedTo: row.review?.assignedTo ?? null,
      splits: row.review?.splits ?? [],
      reimbursementOf,
      revision: row.review?.revision ?? "",
    },
    canEdit: canEdit(row, who.userId),
    canHide: canHide(row, who.userId) && who.via === "browser",
  } satisfies Transaction
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
  if (filters.category) {
    const categoryId = filters.category === "none" ? null : filters.category
    conditions.push(sql`exists (select 1 from json_each(coalesce((select splits from transaction_review where transaction_id = ${transaction.id}), '[null]')) split where (case when split.value is null then ${transaction.categoryId} else json_extract(split.value, '$.categoryId') end) is ${categoryId})`)
  }
  if (filters.review === "needs-review") conditions.push(sql`not exists (select 1 from transaction_review where transaction_id = ${transaction.id} and reviewed_at is not null)`)
  if (filters.review === "assigned-to-me") conditions.push(sql`exists (select 1 from transaction_review where transaction_id = ${transaction.id} and assigned_to = ${who.userId} and reviewed_at is null)`)
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
  const shown = filters.hideExcluded ? eq(transaction.excluded, false) : undefined
  const rows = await selectVisible(who, scope, and(...conditions, shown, after))
    .orderBy(desc(transaction.date), desc(transaction.id))
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  const last = page.at(-1)
  const nextCursor = rows.length > limit && last ? encodeCursor({ date: last.row.date, id: last.row.id }) : null

  let totals = { inMinor: 0, outMinor: 0, count: 0, excluded: 0 }
  if (options.totals !== false) {
    const { convert } = await baseCurrency(who)
    const sums = await sumMatches(who, scope, and(...conditions), convert)
    totals = filters.hideExcluded ? { ...sums, count: sums.count - sums.excluded } : { ...sums, excluded: 0 }
  }
  const partner = await transferPartners(who, page)
  const linked = await visibleReimbursements(who, page)
  return { items: page.map((row) => toTransaction(row, who, partner(row), linked.get(row.row.id) ?? null)), nextCursor, totals }
}

/**
 * In and out (positive) over the matches, without excluded rows; `count` counts every match the caller may see, and
 * `excluded` the excluded ones among them.
 */
async function sumMatches(who: Member, scope: Scope, where: SQL | undefined, convert: Converter) {
  const rows = await db
    .select({
      currency: transaction.currency,
      inMinor: sql<number>`coalesce(sum(case when ${transaction.excluded} = 0 and ${transaction.amountMinor} > 0 then ${transaction.amountMinor} else 0 end), 0)`,
      outMinor: sql<number>`coalesce(sum(case when ${transaction.excluded} = 0 and ${transaction.amountMinor} < 0 then -${transaction.amountMinor} else 0 end), 0)`,
      count: sql<number>`count(*)`,
      excluded: sql<number>`coalesce(sum(case when ${transaction.excluded} = 1 then 1 else 0 end), 0)`,
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
      excluded: sum.excluded + Number(row.excluded),
    }),
    { inMinor: 0, outMinor: 0, count: 0, excluded: 0 },
  )
}

export async function getTransaction(who: Member, id: string, scope: Scope = "household") {
  const [row] = await selectVisible(who, scope, eq(transaction.id, id)).limit(1)
  if (!row) return null
  const result = toTransaction(row, who, (await transferPartners(who, [row]))(row))
  result.review.reimbursementOf = (await visibleReimbursements(who, [row])).get(id) ?? null
  return result
}

export const TransactionChangeSchema = v.object({
  categoryId: v.optional(v.nullable(v.string())),
  note: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(1000)))),
  excluded: v.optional(v.boolean()),
  hidden: v.optional(v.boolean()),
  applyToSimilar: v.optional(v.boolean()),
  reviewed: v.optional(v.boolean()),
  assignedTo: v.optional(v.nullable(v.string())),
  splits: v.optional(v.nullable(v.pipe(v.array(v.object({ categoryId: v.nullable(v.string()), amountMinor: Minor })), v.minLength(2), v.maxLength(20)))),
  reimbursementOf: v.optional(v.nullable(v.string())),
})
export type TransactionChange = v.InferOutput<typeof TransactionChangeSchema>

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
  const [review] = await db.select().from(transactionReview).where(eq(transactionReview.transactionId, id)).limit(1)
  await validateReviewChange(who, row, account, review, change)
  if (change.reimbursementOf) {
    const original = await getTransaction(who, change.reimbursementOf)
    change = { ...change, categoryId: original!.categoryId }
  }
  const set: Partial<typeof transaction.$inferInsert> = {}
  if (change.categoryId !== undefined)
    Object.assign(set, { categoryId: change.categoryId, categoryLocked: true, categorySource: change.categoryId ? "manual" : null, aiGuessId: null })
  if (change.splits !== undefined) Object.assign(set, { categoryLocked: true, categorySource: "manual", aiGuessId: null })
  if (change.note !== undefined) set.note = change.note?.trim() || null
  // A person's call either way: rules stop excluding (or showing) it.
  if (change.excluded !== undefined) Object.assign(set, { excluded: change.excluded, excludeSource: "manual" })
  if (change.hidden !== undefined) set.hidden = change.hidden
  const nextReview = reviewValues(who, row.id, review, change)
  const reviewWrite = db.insert(transactionReview).values(nextReview).onConflictDoUpdate({ target: transactionReview.transactionId, set: nextReview })
  const writes = [reviewWrite]
  const originals = new Set<string>()
  if (change.reimbursementOf !== undefined) {
    if (change.reimbursementOf) originals.add(change.reimbursementOf)
    if (review?.reimbursementOf) {
      const [previous] = await selectVisible(who, "household", eq(transaction.id, review.reimbursementOf)).limit(1)
      const current: Joined = { row, review: review ?? null, accountName: account.name, ownerName: "", ownerId: account.ownerId, visibility: account.visibility, householdPermission: account.householdPermission }
      if (previous && activeRefund(previous, current)) originals.add(previous.row.id)
    }
  }
  for (const transactionId of originals) {
    const revision = crypto.randomUUID()
    writes.push(db.insert(transactionReview).values({ transactionId, revision }).onConflictDoUpdate({ target: transactionReview.transactionId, set: { revision } }))
  }
  if (Object.keys(set).length) await db.batch([db.update(transaction).set(set).where(eq(transaction.id, id)), ...writes])
  else await db.batch([reviewWrite, ...writes.slice(1)])
  // Someone said one side of a detected transfer is something else: the two rows stop being a pair.
  if (change.categoryId !== undefined && row.transferId && !(await isTransferCategory(change.categoryId))) await unpairTransfer(row.transferId)

  if (change.applyToSimilar && change.categoryId) {
    const match = similarMatch(row)
    // Rules are household-wide and every member lists them, so the counterparty of a private account or a hidden
    // transaction never becomes one: similar transactions on the caller's own accounts get the category, and no rule
    // is saved.
    if (match && (account.visibility === "private" || (change.hidden ?? row.hidden)))
      await applyRule(who, { match, categoryId: change.categoryId, exclude: false }, { ownOnly: true })
    else if (match) {
      await ensureRule(who.householdId, match, { categoryId: change.categoryId })
      await applyRule(who, { match, categoryId: change.categoryId, exclude: false })
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

const allocationSource = sql`json_each(coalesce(${transactionReview.splits}, '[null]')) allocation`
const allocationAmount = sql<number>`case when allocation.value is null then ${transaction.amountMinor} else json_extract(allocation.value, '$.amountMinor') end`
const allocationCategory = sql<string | null>`case when allocation.value is null then ${transaction.categoryId} else json_extract(allocation.value, '$.categoryId') end`

/** Money back in a spending category (a refund) lowers that category's spending; it isn't income. */
const isRefund = sql`(${allocationAmount} > 0 and coalesce(${category.kind}, '') = 'expense')`

/** Category kinds that are not spending or income: moving money between your own accounts. */
const notTransfer = or(isNull(category.kind), ne(category.kind, "transfer"))!

const flowSums = {
  inMinor: sql<number>`coalesce(sum(case when ${allocationAmount} > 0 and not ${isRefund} then ${allocationAmount} else 0 end), 0)`,
  // Refunds take back what they refund: money out is net of them.
  outMinor: sql<number>`coalesce(sum(case when ${allocationAmount} < 0 or ${isRefund} then -${allocationAmount} else 0 end), 0)`,
}

export interface FlowOptions {
  scope: Scope
  from: string
  to: string
  /** Narrows the visible accounts further (a condition on financial_account: kinds, not archived). */
  accounts?: SQL
  includeTransfers?: boolean
}

/**
 * Money in and out (both positive) of visible accounts between two dates, in the household's currency, without
 * excluded rows and transfers between accounts. A refund in a spending category lowers money out instead of counting
 * as money in.
 */
export async function cashFlow(who: Member, options: FlowOptions, convert: Converter) {
  const rows = await db
    .select({
      currency: transaction.currency,
      ...flowSums,
    })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .leftJoin(transactionReview, eq(transactionReview.transactionId, transaction.id))
    .leftJoin(allocationSource, sql`1 = 1`)
    .leftJoin(category, eq(category.id, allocationCategory))
    .where(flowConditions(who, options))
    .groupBy(transaction.currency)
  const totals = rows.reduce(
    (sum, row) => ({
      inMinor: sum.inMinor + convert(Number(row.inMinor), row.currency),
      outMinor: sum.outMinor + convert(Number(row.outMinor), row.currency),
    }),
    { inMinor: 0, outMinor: 0 },
  )
  return { ...totals, outMinor: Math.max(0, totals.outMinor) }
}

/** Daily cumulative totals, converting each currency's running sum so the last point matches cashFlow's rounding. */
export async function cashFlowSeries(who: Member, options: FlowOptions, convert: Converter) {
  const rows = await db
    .select({ date: transaction.date, currency: transaction.currency, ...flowSums })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .leftJoin(transactionReview, eq(transactionReview.transactionId, transaction.id))
    .leftJoin(allocationSource, sql`1 = 1`)
    .leftJoin(category, eq(category.id, allocationCategory))
    .where(flowConditions(who, options))
    .groupBy(transaction.date, transaction.currency)
  const days = new Map<string, typeof rows>()
  for (const row of rows) {
    const day = days.get(row.date) ?? []
    day.push(row)
    days.set(row.date, day)
  }
  const currencies = new Map<string, { inMinor: number; outMinor: number }>()
  return eachDay(options.from, options.to).map((date) => {
    for (const row of days.get(date) ?? []) {
      const running = currencies.get(row.currency) ?? { inMinor: 0, outMinor: 0 }
      running.inMinor += Number(row.inMinor)
      running.outMinor += Number(row.outMinor)
      currencies.set(row.currency, running)
    }
    let inMinor = 0
    let outMinor = 0
    for (const [currency, running] of currencies) {
      inMinor += convert(running.inMinor, currency)
      outMinor += convert(running.outMinor, currency)
    }
    return { date, inMinor, outMinor: Math.max(0, outMinor) }
  })
}

function flowConditions(who: Member, options: FlowOptions) {
  return and(
    visibleTransactions(who, options.scope),
    eq(transaction.excluded, false),
    gte(transaction.date, options.from),
    lte(transaction.date, options.to),
    options.includeTransfers ? undefined : notTransfer,
    options.accounts,
  )
}

/** What left visible accounts as transfers (positive, household currency): moves the spending totals leave out. */
export async function movedOut(who: Member, options: FlowOptions, convert: Converter) {
  const rows = await db
    .select({ currency: transaction.currency, outMinor: sql<number>`coalesce(sum(-${allocationAmount}), 0)` })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .leftJoin(transactionReview, eq(transactionReview.transactionId, transaction.id))
    .leftJoin(allocationSource, sql`1 = 1`)
    .innerJoin(category, eq(category.id, allocationCategory))
    .where(
      and(
        visibleTransactions(who, options.scope),
        eq(transaction.excluded, false),
        gte(transaction.date, options.from),
        lte(transaction.date, options.to),
        eq(category.kind, "transfer"),
        sql`${allocationAmount} < 0`,
        options.accounts,
      ),
    )
    .groupBy(transaction.currency)
  return rows.reduce((sum, row) => sum + convert(Number(row.outMinor), row.currency), 0)
}

/** Spending per category (positive, household currency, net of refunds) between two dates; `null` is uncategorized. */
export async function spendingByCategory(who: Member, options: FlowOptions, convert: Converter) {
  const totals = new Map<string | null, number>()
  const rows = await db
    .select({
      categoryId: allocationCategory,
      currency: transaction.currency,
      outMinor: sql<number>`coalesce(sum(-${allocationAmount}), 0)`,
    })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .leftJoin(transactionReview, eq(transactionReview.transactionId, transaction.id))
    .leftJoin(allocationSource, sql`1 = 1`)
    .leftJoin(category, eq(category.id, allocationCategory))
    .where(and(flowConditions(who, options), or(sql`${allocationAmount} < 0`, isRefund)))
    .groupBy(allocationCategory, transaction.currency)
  for (const row of rows) totals.set(row.categoryId, (totals.get(row.categoryId) ?? 0) + convert(Number(row.outMinor), row.currency))
  // A category whose refunds passed its spending spent nothing this month.
  for (const [id, amount] of totals) if (amount <= 0) totals.delete(id)
  return totals
}

/** Net category spending grouped by bank month, in one query for budget history and carry. */
export async function spendingByMonthCategory(who: Member, options: FlowOptions, convert: Converter) {
  const month = sql<string>`substr(${transaction.date}, 1, 7)`
  const rows = await db.select({ month, categoryId: allocationCategory, currency: transaction.currency, outMinor: sql<number>`coalesce(sum(-${allocationAmount}), 0)` })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .leftJoin(transactionReview, eq(transactionReview.transactionId, transaction.id))
    .leftJoin(allocationSource, sql`1 = 1`)
    .leftJoin(category, eq(category.id, allocationCategory))
    .where(and(flowConditions(who, options), or(sql`${allocationAmount} < 0`, isRefund)))
    .groupBy(month, allocationCategory, transaction.currency)
  const months = new Map<string, Map<string | null, number>>()
  for (const row of rows) {
    const totals = months.get(row.month) ?? new Map<string | null, number>()
    totals.set(row.categoryId, (totals.get(row.categoryId) ?? 0) + convert(Number(row.outMinor), row.currency))
    months.set(row.month, totals)
  }
  for (const totals of months.values()) for (const [id, amount] of totals) if (amount <= 0) totals.delete(id)
  return months
}

/** Money in and out (both positive, household currency) per category between two dates, without transfers. */
export async function flowByCategory(who: Member, options: FlowOptions, convert: Converter) {
  const totals = new Map<string | null, { inMinor: number; outMinor: number }>()
  const rows = await db
    .select({
      categoryId: allocationCategory,
      currency: transaction.currency,
      inMinor: sql<number>`coalesce(sum(case when ${allocationAmount} > 0 then ${allocationAmount} else 0 end), 0)`,
      outMinor: sql<number>`coalesce(sum(case when ${allocationAmount} < 0 then -${allocationAmount} else 0 end), 0)`,
    })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .leftJoin(transactionReview, eq(transactionReview.transactionId, transaction.id))
    .leftJoin(allocationSource, sql`1 = 1`)
    .leftJoin(category, eq(category.id, allocationCategory))
    .where(flowConditions(who, options))
    .groupBy(allocationCategory, transaction.currency)
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
      transactionId: transaction.id,
      accountId: transaction.accountId,
      categoryId: allocationCategory,
      categoryKind: category.kind,
      date: transaction.date,
      amountMinor: allocationAmount,
      currency: transaction.currency,
      description: transaction.description,
      counterparty: transaction.counterparty,
    })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .leftJoin(transactionReview, eq(transactionReview.transactionId, transaction.id))
    .leftJoin(allocationSource, sql`1 = 1`)
    .leftJoin(category, eq(category.id, allocationCategory))
    .where(flowConditions(who, options))
}

type ReviewRow = typeof transactionReview.$inferSelect

type Audience = Pick<Joined, "ownerId" | "visibility"> & Pick<typeof transaction.$inferSelect, "hidden">
const audienceOf = (entry: Joined): Audience => ({ ownerId: entry.ownerId, visibility: entry.visibility, hidden: entry.row.hidden })
function sameAudience(left: Audience, right: Audience) {
  const leftPrivate = left.hidden || left.visibility === "private"
  const rightPrivate = right.hidden || right.visibility === "private"
  return leftPrivate === rightPrivate && (!leftPrivate || left.ownerId === right.ownerId)
}
function activeRefund(original: Joined, refund: Joined) {
  return sameAudience(audienceOf(original), audienceOf(refund)) &&
    original.row.amountMinor < 0 && refund.row.amountMinor > 0 &&
    original.row.currency === refund.row.currency && original.row.date <= refund.row.date &&
    original.row.categoryId !== null && original.row.categoryId === refund.row.categoryId &&
    !original.review?.splits?.length && !refund.review?.splits?.length
}
async function linkedRefunds(who: Member, original: Joined) {
  const rows = await selectVisible(who, "household", eq(transactionReview.reimbursementOf, original.row.id))
  return rows.filter((refund) => activeRefund(original, refund))
}
async function visibleReimbursements(who: Member, rows: Joined[]) {
  const ids = [...new Set(rows.flatMap((row) => row.review?.reimbursementOf ? [row.review.reimbursementOf] : []))]
  const originals = new Map<string, Joined>()
  for (let index = 0; index < ids.length; index += 90) {
    for (const row of await selectVisible(who, "household", inArray(transaction.id, ids.slice(index, index + 90)))) originals.set(row.row.id, row)
  }
  const links = new Map<string, string>()
  for (const refund of rows) {
    const original = refund.review?.reimbursementOf ? originals.get(refund.review.reimbursementOf) : undefined
    if (original && activeRefund(original, refund)) links.set(refund.row.id, original.row.id)
  }
  return links
}

async function validateReviewChange(
  who: Member,
  row: typeof transaction.$inferSelect,
  account: Awaited<ReturnType<typeof requireAccount>>,
  review: ReviewRow | undefined,
  change: TransactionChange,
) {
  const current: Joined = { row, review: review ?? null, accountName: account.name, ownerId: account.ownerId, ownerName: "", visibility: account.visibility, householdPermission: account.householdPermission }
  const dependents = await linkedRefunds(who, current)
  const [linkedOriginal] = review?.reimbursementOf ? await selectVisible(who, "household", eq(transaction.id, review.reimbursementOf)).limit(1) : []
  const hasRefundLink = linkedOriginal !== undefined && activeRefund(linkedOriginal, current)
  if (change.assignedTo) {
    const [person] = await db.select({ id: member.userId }).from(member)
      .where(and(eq(member.userId, change.assignedTo), eq(member.organizationId, who.householdId))).limit(1)
    if (!person || !canSeeTransaction(account, { hidden: change.hidden ?? row.hidden }, change.assignedTo) || !canEdit(account, change.assignedTo))
      throw new HTTPError({ status: 400, statusText: "Choose a household member who can see this transaction.", data: { code: "transactionAssigneeUnavailable" } })
  }
  if (change.splits) {
    const sum = change.splits.reduce((total, part) => total + part.amountMinor, 0)
    if (!Number.isSafeInteger(sum) || sum !== row.amountMinor || change.splits.some((part) => !part.amountMinor || Math.sign(part.amountMinor) !== Math.sign(row.amountMinor)))
      throw new HTTPError({ status: 400, statusText: "Split amounts must have the same sign and add up to the original amount.", data: { code: "transactionSplitMustBalance" } })
    if (row.transferId || (change.reimbursementOf === undefined ? hasRefundLink : change.reimbursementOf))
      throw new HTTPError({ status: 400, statusText: "Remove the transfer or refund link before splitting this transaction.", data: { code: "transactionSplitLinked" } })
    const ids = [...new Set(change.splits.flatMap((part) => part.categoryId ? [part.categoryId] : []))]
    if (ids.length) {
      const found = await db.select({ id: category.id, kind: category.kind }).from(category)
        .where(and(eq(category.householdId, who.householdId), inArray(category.id, ids)))
      if (found.length !== ids.length || found.some((item) => item.kind === "transfer"))
        throw new HTTPError({ status: 400, statusText: "Use spending or income categories for splits.", data: { code: "transactionSplitCategoryInvalid" } })
    }
    if (dependents.length) throw new HTTPError({ status: 400, statusText: "Unlink its refunds before splitting this transaction.", data: { code: "transactionSplitHasRefunds" } })
  }
  if (change.reimbursementOf) {
    const [original] = await selectVisible(who, "household", eq(transaction.id, change.reimbursementOf)).limit(1)
    const audience = { ...audienceOf(current), hidden: change.hidden ?? row.hidden }
    if (!original || !sameAudience(audienceOf(original), audience) || row.amountMinor <= 0 || original.row.amountMinor >= 0 || original.row.date > row.date || original.row.currency !== row.currency || row.transferId || (change.splits === undefined ? review?.splits?.length : change.splits?.length) || original.review?.splits?.length || !original.row.categoryId)
      throw new HTTPError({ status: 400, statusText: "Choose an unsplit expense in the same currency and sharing audience for this refund.", data: { code: "transactionRefundInvalid" } })
    const [kind] = await db.select({ kind: category.kind }).from(category).where(eq(category.id, original.row.categoryId)).limit(1)
    if (kind?.kind !== "expense") throw new HTTPError({ status: 400, statusText: "Choose a spending transaction for this refund.", data: { code: "transactionRefundInvalid" } })
    const paired = (await linkedRefunds(who, original)).filter((entry) => entry.row.id !== row.id)
    if (paired.reduce((sum, item) => sum + item.row.amountMinor, row.amountMinor) > -original.row.amountMinor)
      throw new HTTPError({ status: 400, statusText: "Refunds cannot exceed the original expense.", data: { code: "transactionRefundTooLarge" } })
  }
  if (change.categoryId !== undefined && change.categoryId !== row.categoryId) {
    if (dependents.length || (hasRefundLink && change.reimbursementOf !== null))
      throw new HTTPError({ status: 400, statusText: "Unlink refunds before changing the category.", data: { code: "transactionUnlinkRefundFirst" } })
  }
  if (change.categoryId !== undefined && review?.splits?.length && change.splits === undefined)
    throw new HTTPError({ status: 400, statusText: "Edit or remove the split before changing the category.", data: { code: "transactionEditSplitFirst" } })
}

function reviewValues(who: Member, id: string, review: ReviewRow | undefined, change: TransactionChange): typeof transactionReview.$inferInsert {
  return {
    transactionId: id,
    reviewedAt: change.reviewed === undefined ? review?.reviewedAt ?? null : change.reviewed ? new Date() : null,
    reviewedBy: change.reviewed === undefined ? review?.reviewedBy ?? null : change.reviewed ? who.userId : null,
    assignedTo: change.assignedTo === undefined ? (change.hidden ? null : review?.assignedTo ?? null) : change.assignedTo,
    splits: change.splits === undefined ? review?.splits ?? null : change.splits,
    reimbursementOf: change.reimbursementOf === undefined ? review?.reimbursementOf ?? null : change.reimbursementOf,
    revision: crypto.randomUUID(),
  }
}

export async function refundCandidates(who: Member, id: string) {
  const [refund] = await selectVisible(who, "household", eq(transaction.id, id)).limit(1)
  if (!refund) throw new HTTPError({ status: 404, statusText: "No such transaction." })
  if (refund.row.amountMinor < 0) return (await linkedRefunds(who, refund)).map((row) => toTransaction(row, who, null, id))
  if (refund.row.amountMinor === 0 || !canEdit(refund, who.userId)) return []
  const rows = await selectVisible(who, "household", and(
    eq(transaction.currency, refund.row.currency),
    sql`${transaction.amountMinor} < 0`,
    lte(transaction.date, refund.row.date),
    eq(transaction.excluded, false),
    sql`${transaction.categoryId} in (select id from category where kind = 'expense')`,
    isNull(transactionReview.splits),
  )).orderBy(desc(transaction.date)).limit(100)
  return rows.filter((row) => sameAudience(audienceOf(row), audienceOf(refund))).map((row) => toTransaction(row, who))
}

const BulkChangeSchema = v.object({
  categoryId: v.optional(v.nullable(v.string())),
  reviewed: v.optional(v.boolean()),
  assignedTo: v.optional(v.nullable(v.string())),
})
export const TransactionBulkSchema = v.object({
  ids: v.pipe(v.array(v.string()), v.minLength(1), v.maxLength(100)),
  change: BulkChangeSchema,
})

type TransactionState = Omit<typeof transaction.$inferSelect, "createdAt"> & { createdAt: string }
const transactionState = (row: typeof transaction.$inferSelect): TransactionState => ({ ...row, createdAt: row.createdAt.toISOString() })

type UndoSnapshot = {
  after: TransactionState
  id: string
  categoryId: string | null
  categoryLocked: boolean
  categorySource: typeof transaction.$inferSelect.categorySource
  aiGuessId: string | null
  review: (Omit<ReviewRow, "reviewedAt"> & { reviewedAt: string | null }) | null
  revision: string
}
type UndoRecord = { at: number; userId: string; householdId: string; snapshots: UndoSnapshot[] }

export async function bulkUpdateTransactions(who: Member, input: v.InferOutput<typeof TransactionBulkSchema>): Promise<TransactionBulkResult> {
  if (!Object.keys(input.change).length) throw new HTTPError({ status: 400, statusText: "Choose a change.", data: { code: "transactionChooseChange" } })
  const ids = [...new Set(input.ids)]
  const snapshots: UndoSnapshot[] = []
  const writes = []
  for (const id of ids) {
    const [entry] = await selectVisible(who, "household", eq(transaction.id, id)).limit(1)
    if (!entry) throw new HTTPError({ status: 404, statusText: "No such transaction." })
    if (!canEdit(entry, who.userId)) throw new HTTPError({ status: 403, statusText: "You can view this account but not edit it." })
    if (input.change.categoryId && !(await db.select({ id: category.id }).from(category).where(and(eq(category.id, input.change.categoryId), eq(category.householdId, who.householdId))).limit(1)).length)
      throw new HTTPError({ status: 400, statusText: "No such category." })
    await validateReviewChange(who, entry.row, await requireAccount(who, entry.row.accountId), entry.review ?? undefined, input.change)
    if (input.change.categoryId !== undefined && entry.row.transferId)
      throw new HTTPError({ status: 400, statusText: "Change detected transfers individually.", data: { code: "transactionBulkTransfer" } })
    const next = reviewValues(who, id, entry.review ?? undefined, input.change)
    const after = input.change.categoryId === undefined ? entry.row : { ...entry.row, categoryId: input.change.categoryId, categoryLocked: true, categorySource: input.change.categoryId ? "manual" : null, aiGuessId: null } satisfies typeof transaction.$inferSelect
    snapshots.push({ after: transactionState(after), id, categoryId: entry.row.categoryId, categoryLocked: entry.row.categoryLocked, categorySource: entry.row.categorySource, aiGuessId: entry.row.aiGuessId, review: entry.review ? { ...entry.review, reviewedAt: entry.review.reviewedAt?.toISOString() ?? null } : null, revision: next.revision })
    if (input.change.categoryId !== undefined) writes.push(db.update(transaction).set({ categoryId: input.change.categoryId, categoryLocked: true, categorySource: input.change.categoryId ? "manual" : null, aiGuessId: null }).where(eq(transaction.id, id)))
    writes.push(db.insert(transactionReview).values(next).onConflictDoUpdate({ target: transactionReview.transactionId, set: next }))
  }
  const undoToken = crypto.randomUUID()
  const [storeError] = await kv.set(`transaction-undo:${undoToken}`, { at: Date.now(), userId: who.userId, householdId: who.householdId, snapshots } satisfies UndoRecord, { ttl: 600 })
  if (storeError) throw new HTTPError({ status: 503, statusText: "Undo storage is unavailable. No transactions were changed.", data: { code: "transactionUndoUnavailable" } })
  const [first, ...rest] = writes
  if (first) await db.batch([first, ...rest])
  const items: Transaction[] = []
  for (const id of ids) {
    const item = await getTransaction(who, id)
    if (item) items.push(item)
  }
  return { items, undoToken }
}

export async function undoTransactionBulk(who: Member, token: string) {
  const [storeError, record] = await kv.get<UndoRecord>(`transaction-undo:${token}`)
  if (storeError) throw new HTTPError({ status: 503, statusText: "Undo storage is unavailable. No transactions were changed.", data: { code: "transactionUndoUnavailable" } })
  if (!record || record.userId !== who.userId || record.householdId !== who.householdId || Date.now() - record.at > 600_000)
    throw new HTTPError({ status: 404, statusText: "This undo has expired.", data: { code: "transactionUndoExpired" } })
  const writes = []
  for (const snapshot of record.snapshots) {
    const [entry] = await selectVisible(who, "household", eq(transaction.id, snapshot.id)).limit(1)
    if (!entry || !canEdit(entry, who.userId)) throw new HTTPError({ status: 404, statusText: "No such transaction." })
    if (entry.review?.revision !== snapshot.revision || JSON.stringify(transactionState(entry.row)) !== JSON.stringify(snapshot.after)) throw new HTTPError({ status: 409, statusText: "A transaction changed since this edit. Refresh before trying again.", data: { code: "transactionUndoConflict" } })
    try {
      await validateReviewChange(who, entry.row, await requireAccount(who, entry.row.accountId), entry.review ?? undefined, { ...(snapshot.categoryId === entry.row.categoryId ? {} : { categoryId: snapshot.categoryId }), assignedTo: snapshot.review?.assignedTo ?? null })
    } catch {
      throw new HTTPError({ status: 409, statusText: "A transaction changed since this edit. Refresh before trying again.", data: { code: "transactionUndoConflict" } })
    }
    writes.push(db.update(transaction).set({ categoryId: snapshot.categoryId, categoryLocked: snapshot.categoryLocked, categorySource: snapshot.categorySource, aiGuessId: snapshot.aiGuessId }).where(eq(transaction.id, snapshot.id)))
    const previous = snapshot.review
    const restored = { transactionId: snapshot.id, reviewedAt: previous?.reviewedAt ? new Date(previous.reviewedAt) : null, reviewedBy: previous?.reviewedBy ?? null, assignedTo: previous?.assignedTo ?? null, splits: previous?.splits ?? null, reimbursementOf: previous?.reimbursementOf ?? null, revision: crypto.randomUUID() }
    writes.push(db.insert(transactionReview).values(restored).onConflictDoUpdate({ target: transactionReview.transactionId, set: restored }))
  }
  const [first, ...rest] = writes
  if (first) await db.batch([first, ...rest])
  await kv.del(`transaction-undo:${token}`)
  return { restored: record.snapshots.length }
}
