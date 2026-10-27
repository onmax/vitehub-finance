import { and, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import { financialAccount, rule, transaction } from "../databases/config"
import type { Member } from "./identity"
import { sqliteLowerForms } from "../providers/dedupe"
import { normalizedWords } from "./recurring-core"

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

/**
 * What "apply to similar" matches on: the counterparty when the bank names one, else the description's first
 * meaningful words (up to three in a row, skipping card masks, dates, and payment words), as they appear in it.
 */
export function similarMatch(row: { description: string; counterparty: string | null }) {
  const counterparty = row.counterparty?.trim().toLowerCase()
  if (counterparty && counterparty.length >= 3) return counterparty
  const text = row.description.toLowerCase()
  const tokens = [...text.matchAll(/\S+/g)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    meaningful: !/\d/.test(match[0]) && normalizedWords(match[0]).length > 0,
  }))
  const first = tokens.findIndex((token) => token.meaningful)
  if (first < 0) return null
  let last = first
  while (last + 1 < tokens.length && last - first < 2 && tokens[last + 1]!.meaningful) last++
  const match = text.slice(tokens[first]!.start, tokens[last]!.end).replace(/[.,;:]+$/, "")
  return match.length >= 3 ? match : null
}

/** A rule for `match`, reusing an identical one (and turning its `exclude` on when asked). */
export async function ensureRule(householdId: string, match: string, categoryId: string, exclude = false) {
  const [existing] = await db
    .select()
    .from(rule)
    .where(and(eq(rule.householdId, householdId), eq(rule.match, match), eq(rule.categoryId, categoryId)))
    .limit(1)
  if (existing && (existing.exclude || !exclude)) return existing
  if (existing) return (await db.update(rule).set({ exclude }).where(eq(rule.id, existing.id)).returning())[0]!
  const [created] = await db.insert(rule).values({ id: crypto.randomUUID(), householdId, match, categoryId, exclude }).returning()
  return created!
}

/**
 * Gives `categoryId` to the caller's editable, uncategorized, unlocked transactions that match. With `exclude`, it
 * also excludes every match whose category no one picked by hand. Accounts they may only view, or not see, stay
 * untouched; the sync applies the rule to new transactions everywhere.
 */
export async function applyRule(
  who: Pick<Member, "userId" | "householdId">,
  match: string,
  categoryId: string,
  options: { ownOnly?: boolean; exclude?: boolean } = {},
) {
  const accounts = options.ownOnly
    ? and(eq(financialAccount.householdId, who.householdId), eq(financialAccount.ownerId, who.userId))
    : editableAccounts(who)
  const editable = db.select({ id: financialAccount.id }).from(financialAccount).where(accounts)
  if (options.exclude) await excludeMatches(and(eq(transaction.householdId, who.householdId), inArray(transaction.accountId, editable))!, match)
  const updated = await db
    .update(transaction)
    .set({ categoryId, categorySource: "rule" })
    .where(
      and(
        eq(transaction.householdId, who.householdId),
        inArray(transaction.accountId, editable),
        isNull(transaction.categoryId),
        eq(transaction.categoryLocked, false),
        ruleMatches(match),
      ),
    )
    .returning({ id: transaction.id })
  return updated.length
}

/** Rules of a household applied to the uncategorized, unlocked transactions of some accounts (after a move). */
export async function applyRulesTo(householdId: string, accountIds: string[]) {
  if (!accountIds.length) return
  const rules = await db.select().from(rule).where(eq(rule.householdId, householdId))
  for (const entry of rules)
    for (let index = 0; index < accountIds.length; index += 80) {
      const accounts = and(eq(transaction.householdId, householdId), inArray(transaction.accountId, accountIds.slice(index, index + 80)))!
      if (entry.exclude) await excludeMatches(accounts, entry.match)
      await db
        .update(transaction)
        .set({ categoryId: entry.categoryId, categorySource: "rule" })
        .where(
          and(
            eq(transaction.householdId, householdId),
            inArray(transaction.accountId, accountIds.slice(index, index + 80)),
            isNull(transaction.categoryId),
            eq(transaction.categoryLocked, false),
            ruleMatches(entry.match),
          ),
        )
    }
}

/** Excludes the matches of `match` in `accounts` whose category no one picked by hand, and that aren't locked. */
async function excludeMatches(accounts: SQL, match: string) {
  await db
    .update(transaction)
    .set({ excluded: true })
    .where(
      and(
        accounts,
        eq(transaction.categoryLocked, false),
        or(isNull(transaction.categorySource), ne(transaction.categorySource, "manual")),
        ruleMatches(match),
      ),
    )
}
