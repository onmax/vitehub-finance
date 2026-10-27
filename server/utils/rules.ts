import { asc, eq } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import type { Rule, RuleSuggestion } from "#shared/api"
import { canEdit } from "#shared/access"
import { dismissedSuggestion, financialAccount, member, rule, transaction, user as users } from "../databases/config"
import { startsWord } from "../providers/dedupe"
import { visibleTransactions } from "./access"
import type { Member } from "./identity"
import { suggestRules } from "./rule-suggestions-core"

type Who = Pick<Member, "userId" | "householdId">

const householdRules = (householdId: string) =>
  db
    .select({ id: rule.id, match: rule.match, categoryId: rule.categoryId, exclude: rule.exclude })
    .from(rule)
    .where(eq(rule.householdId, householdId))
    .orderBy(asc(rule.match))

/** The transactions the caller sees, with what rules and suggestions read. */
const visibleRows = (who: Who) =>
  db
    .select({
      description: transaction.description,
      counterparty: transaction.counterparty,
      categoryId: transaction.categoryId,
      categorySource: transaction.categorySource,
      aiGuessId: transaction.aiGuessId,
      excluded: transaction.excluded,
      excludeSource: transaction.excludeSource,
      transferId: transaction.transferId,
      hidden: transaction.hidden,
      ownerId: financialAccount.ownerId,
      visibility: financialAccount.visibility,
      householdPermission: financialAccount.householdPermission,
    })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .where(visibleTransactions(who))

/** The household's rules, each with how many of the caller's visible transactions it matches. */
export async function listRules(who: Who): Promise<Rule[]> {
  const [rules, rows] = await Promise.all([householdRules(who.householdId), visibleRows(who)])
  const texts = rows.map((row) => `${row.description.toLowerCase()}\n${(row.counterparty ?? "").toLowerCase()}`)
  return rules.map((entry) => ({ ...entry, matches: texts.filter((text) => startsWord(text, entry.match.toLowerCase())).length }))
}

/**
 * Rules worth adding, from the transactions the caller may edit. Rules are household-wide and every member lists them,
 * so private accounts and hidden transactions never suggest one (as with "apply to similar").
 */
export async function listRuleSuggestions(who: Who): Promise<RuleSuggestion[]> {
  const [rules, rows, dismissed, people] = await Promise.all([
    householdRules(who.householdId),
    visibleRows(who),
    db.select({ key: dismissedSuggestion.key }).from(dismissedSuggestion).where(eq(dismissedSuggestion.householdId, who.householdId)),
    db.select({ name: users.name }).from(member).innerJoin(users, eq(users.id, member.userId)).where(eq(member.organizationId, who.householdId)),
  ])
  const shared = rows
    .filter((row) => row.visibility === "household" && !row.hidden && canEdit(row, who.userId))
    .map((row) => ({ ...row, transfer: row.transferId !== null }))
  return suggestRules(shared, rules, new Set(dismissed.map((row) => row.key)), people.map((person) => person.name))
}

export async function dismissRuleSuggestion(householdId: string, key: string) {
  await db.insert(dismissedSuggestion).values({ householdId, key }).onConflictDoNothing()
}

