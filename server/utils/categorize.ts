import { and, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import { financialAccount, rule, transaction } from "../databases/config"
import type { Member } from "./identity"
import { ruleActions, sqliteLowerForms } from "../providers/dedupe"

/** The accounts someone may categorize: shared/access.ts `canEdit`, as SQL. */
export function editableAccounts(who: Pick<Member, "userId" | "householdId">): SQL {
  return and(
    eq(financialAccount.householdId, who.householdId),
    or(
      eq(financialAccount.ownerId, who.userId),
      and(eq(financialAccount.visibility, "household"), eq(financialAccount.householdPermission, "edit")),
    ),
  )!
}

/**
 * The transactions someone may change in bulk (rules, AI categories), as a condition on `transaction` alone, since an
 * UPDATE has no join: on `accounts` (by default the ones they may edit, `editableAccounts`), and never another owner's
 * hidden row (server/utils/access.ts `visibleTransactions`). Every bulk read and update of transactions uses it.
 */
export function writableTransactions(who: Pick<Member, "userId" | "householdId">, accounts: SQL = editableAccounts(who)): SQL {
  const ids = (where: SQL) => db.select({ id: financialAccount.id }).from(financialAccount).where(where)
  const own = and(eq(financialAccount.householdId, who.householdId), eq(financialAccount.ownerId, who.userId))!
  return and(
    eq(transaction.householdId, who.householdId),
    inArray(transaction.accountId, ids(accounts)),
    or(eq(transaction.hidden, false), inArray(transaction.accountId, ids(own))),
  )!
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`)

/** Description or counterparty contains `text`, ignoring case: how a rule matches. */
export function textMatches(text: string): SQL {
  return or(
    ...sqliteLowerForms(text).flatMap((form) => {
      const pattern = `%${escapeLike(form)}%`
      return [
        sql`lower(${transaction.description}) like ${pattern} escape '\\'`,
        sql`lower(coalesce(${transaction.counterparty}, '')) like ${pattern} escape '\\'`,
      ]
    }),
  )!
}

/**
 * How a rule matches, as SQL: `match` starts a word in the description or counterparty, ignoring case
 * (server/providers/dedupe.ts `startsWord` in JS). "fee" matches "Bank fee" but not "Coffee".
 */
export function ruleMatches(text: string): SQL {
  const patterns = sqliteLowerForms(text).flatMap((form) => {
    const needle = escapeLike(form)
    return [`${needle}%`, ...[" ", "*", ".", "/", "-", ",", "(", ":"].map((before) => `%${escapeLike(before)}${needle}%`)]
  })
  const column = (value: SQL) => or(...patterns.map((pattern) => sql`${value} like ${pattern} escape '\\'`))!
  return or(column(sql`lower(${transaction.description})`), column(sql`lower(coalesce(${transaction.counterparty}, ''))`))!
}

export interface RuleAction {
  /** The category to file matches under; null leaves categories alone. */
  categoryId: string | null
  exclude: boolean
}

/**
 * The household's rule for `match`, made or updated: one rule per match. A category given replaces the rule's; asking
 * to exclude turns `exclude` on (it's never turned off here: that's `setRule`).
 */
export async function ensureRule(householdId: string, match: string, action: Partial<RuleAction>) {
  const [existing] = await db
    .select()
    .from(rule)
    .where(and(eq(rule.householdId, householdId), eq(rule.match, match)))
    .limit(1)
  if (!existing) {
    const [created] = await db
      .insert(rule)
      .values({ id: crypto.randomUUID(), householdId, match, categoryId: action.categoryId ?? null, exclude: action.exclude ?? false })
      .returning()
    return created!
  }
  const categoryId = action.categoryId ?? existing.categoryId
  const exclude = existing.exclude || Boolean(action.exclude)
  if (categoryId === existing.categoryId && exclude === existing.exclude) return existing
  return (await db.update(rule).set({ categoryId, exclude }).where(eq(rule.id, existing.id)).returning())[0]!
}

/**
 * A rule's new action. Turning `exclude` off brings back the transactions it excluded that the caller may change (unless
 * another rule still excludes them); a new category or `exclude` applies like a new rule (`applyRule`).
 */
export async function setRule(who: Pick<Member, "userId" | "householdId">, id: string, action: RuleAction) {
  const [existing] = await db
    .select()
    .from(rule)
    .where(and(eq(rule.id, id), eq(rule.householdId, who.householdId)))
    .limit(1)
  if (!existing) return null
  const [saved] = await db.update(rule).set(action).where(eq(rule.id, id)).returning()
  if (existing.exclude && !action.exclude) await includeMatches(who, existing.match, id)
  await applyRule(who, saved!)
  return saved!
}

/**
 * Deletes a rule; what it excluded comes back on the transactions the caller may change, unless another rule still
 * excludes it. Rows on accounts they can't edit, or hidden from them, stay as they are.
 */
export async function deleteRule(who: Pick<Member, "userId" | "householdId">, id: string) {
  const [deleted] = await db
    .delete(rule)
    .where(and(eq(rule.id, id), eq(rule.householdId, who.householdId)))
    .returning()
  if (deleted?.exclude) await includeMatches(who, deleted.match, id)
  return deleted ?? null
}

/**
 * Applies a rule to the caller's editable transactions (`ownOnly`: their own accounts' only): its category to the
 * uncategorized, unlocked ones, and with `exclude`, excludes every match no one decided on by hand. Accounts they may
 * only view, or not see, and rows another owner hid stay untouched; the sync applies the rule to new transactions
 * everywhere.
 */
export async function applyRule(
  who: Pick<Member, "userId" | "householdId">,
  entry: { match: string } & RuleAction,
  options: { ownOnly?: boolean } = {},
) {
  const accounts = options.ownOnly
    ? and(eq(financialAccount.householdId, who.householdId), eq(financialAccount.ownerId, who.userId))
    : editableAccounts(who)
  const editable = writableTransactions(who, accounts)
  if (entry.exclude) await excludeMatches(editable, entry.match)
  if (entry.categoryId) await categorizeMatches(editable, entry.match, entry.categoryId)
}

/**
 * The rules of the caller's household applied to the uncategorized, unlocked transactions of some of the accounts they
 * may change (after a move: their own, in their new household).
 */
export async function applyRulesTo(who: Pick<Member, "userId" | "householdId">, accountIds: string[]) {
  if (!accountIds.length) return
  const rules = await db.select().from(rule).where(eq(rule.householdId, who.householdId))
  for (const entry of rules)
    for (let index = 0; index < accountIds.length; index += 80) {
      const accounts = and(writableTransactions(who), inArray(transaction.accountId, accountIds.slice(index, index + 80)))!
      if (entry.exclude) await excludeMatches(accounts, entry.match)
      if (entry.categoryId) await categorizeMatches(accounts, entry.match, entry.categoryId)
    }
}

async function categorizeMatches(accounts: SQL, match: string, categoryId: string) {
  await db
    .update(transaction)
    .set({ categoryId, categorySource: "rule" })
    .where(and(accounts, isNull(transaction.categoryId), eq(transaction.categoryLocked, false), ruleMatches(match)))
}

/**
 * Excludes the matches of `match` in `accounts` that no one decided on: not excluded or shown by hand, not locked, and
 * with no category picked by hand.
 */
async function excludeMatches(accounts: SQL, match: string) {
  await db
    .update(transaction)
    .set({ excluded: true, excludeSource: "rule" })
    .where(
      and(
        accounts,
        isNull(transaction.excludeSource),
        eq(transaction.categoryLocked, false),
        or(isNull(transaction.categorySource), ne(transaction.categorySource, "manual")),
        ruleMatches(match),
      ),
    )
}

/**
 * Brings back what rules excluded and `match` matches, among the transactions the caller may change, except what another
 * of the household's excluding rules matches.
 */
async function includeMatches(who: Pick<Member, "userId" | "householdId">, match: string, ruleId: string) {
  const others = await db
    .select({ match: rule.match, categoryId: rule.categoryId, exclude: rule.exclude })
    .from(rule)
    .where(and(eq(rule.householdId, who.householdId), eq(rule.exclude, true), ne(rule.id, ruleId)))
  const writable = writableTransactions(who)
  const rows = await db
    .select({ id: transaction.id, description: transaction.description, counterparty: transaction.counterparty })
    .from(transaction)
    .where(and(writable, eq(transaction.excludeSource, "rule"), ruleMatches(match)))
  const ids = rows.filter((row) => !ruleActions(others, row).exclude).map((row) => row.id)
  for (let index = 0; index < ids.length; index += 90)
    await db
      .update(transaction)
      .set({ excluded: false, excludeSource: null })
      .where(and(writable, inArray(transaction.id, ids.slice(index, index + 90))))
}
