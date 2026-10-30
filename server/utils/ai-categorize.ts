import { and, count, desc, eq, inArray, isNull, ne, type SQL } from "drizzle-orm"
import type { RequestLogger } from "evlog"
import { db } from "vite-hub/database/drizzle"
import { category, financialAccount, householdSettings, member, rule, transaction, user as users } from "../databases/config"
import { isDemo, isDemoPerson } from "../demo/mode"
import { classify, costUsd, type AiCategory, type Usage } from "./ai-categorize-core"
import { routeFor, type Route } from "./ai-gateway"
import { writableTransactions } from "./categorize"
import type { Member } from "./identity"

/** Rows asked about per call of the one-off action, so a request stays well inside a Worker's time. */
export const ACTION_LIMIT = 200
/** Rows asked about per sync. A first sync brings a year; the rest wait for the next sync or the action. */
export const SYNC_LIMIT = 400

/**
 * The caller's household route to Jev (its own key, else the server's), or null: AI categories need a key and are never
 * for the demo's people, whose data is fictional anyway.
 */
export const aiRouteFor = async (who: { email: string; householdId: string }) => (isDemoPerson(who.email) ? null : await routeFor(who.householdId))

/** Whether the demo's people are in this household (the demo build only). */
async function demoHousehold(householdId: string) {
  if (!isDemo()) return false
  const people = await db
    .select({ email: users.email })
    .from(member)
    .innerJoin(users, eq(users.id, member.userId))
    .where(eq(member.organizationId, householdId))
  return people.some((person) => isDemoPerson(person.email))
}

interface AiOutcome {
  /** Rows Jev was asked about. */
  asked: number
  /** Rows that got a category. */
  categorized: number
  /** Rows still waiting: uncategorized and never asked, in the same accounts. */
  remaining: number
}

type Log = Pick<RequestLogger, "set" | "warn">

/**
 * Which rows may go to Jev, and so to whoever runs the AI gateway:
 *
 * - `{ caller }`: someone pressed "Categorize with AI". Only rows they may both see and edit
 *   (`writableTransactions`): never another member's private account or hidden row.
 * - `{ accounts }`: the sync or a CSV import, which nobody asked about. Rows in `accounts` (a condition on
 *   `financialAccount`), never a hidden one, whoever's key answers. Through the household's own key, set by one of its
 *   owners (nothing records which), never a private account's either: its owner never agreed to that key, while the
 *   server's own route (ai-gateway.ts) is the operator's, who holds the database anyway. A private account's owner
 *   still gets its rows categorized by pressing the button.
 */
type AiRows = { caller: Pick<Member, "userId" | "householdId"> } | { accounts: SQL }

function allowedRows(rows: AiRows, route: Route): SQL {
  if ("caller" in rows) return writableTransactions(rows.caller)
  return and(rows.accounts, eq(transaction.hidden, false), route.source === "household" ? eq(financialAccount.visibility, "household") : undefined)!
}

/**
 * Asks Jev for the categories rules didn't give: uncategorized, unlocked rows that `rows` allows (`AiRows`) and AI hasn't
 * looked at yet, newest first, at most `limit`. A sure answer sets the category with
 * `categorySource: "ai"`; every row asked is marked, so an unsure one isn't asked (or paid for) again. Rows in a batch
 * whose request failed stay unmarked for next time.
 *
 * Nothing happens without a key (the household's or the server's, server/utils/ai-gateway.ts), for the demo's household,
 * or when the household turned it off. The log gets the route, counts, token usage, and cost, never the transactions' text.
 */
export async function categorizeWithAi(householdId: string, rows: AiRows, options: { limit: number; log?: Log }): Promise<AiOutcome | null> {
  if (await demoHousehold(householdId)) return null
  const route = await routeFor(householdId)
  if (!route) return null
  const [settings] = await db
    .select({ aiCategorize: householdSettings.aiCategorize })
    .from(householdSettings)
    .where(eq(householdSettings.householdId, householdId))
    .limit(1)
  if (settings && !settings.aiCategorize) return null

  const pending = and(
    eq(transaction.householdId, householdId),
    isNull(transaction.categoryId),
    eq(transaction.categoryLocked, false),
    isNull(transaction.aiCheckedAt),
    isNull(transaction.transferId),
    eq(transaction.excluded, false),
    ne(transaction.amountMinor, 0),
    allowedRows(rows, route),
  )
  const batch = await db
    .select({
      id: transaction.id,
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
      description: transaction.description,
      counterparty: transaction.counterparty,
      accountKind: financialAccount.kind,
    })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .where(pending)
    .orderBy(desc(transaction.date))
    .limit(options.limit)
  if (!batch.length) return { asked: 0, categorized: 0, remaining: 0 }

  const categories = await householdCategories(householdId)
  const names = (
    await db.select({ name: users.name }).from(member).innerJoin(users, eq(users.id, member.userId)).where(eq(member.organizationId, householdId))
  ).map((row) => row.name)

  const started = Date.now()
  let result: Awaited<ReturnType<typeof classify>>
  try {
    result = await classify(batch, categories, { gateway: route.gateway, names })
  } catch (error) {
    options.log?.warn("AI categories failed", { ai: { ...where(route), error: error instanceof Error ? error.message : String(error) } })
    throw error
  }
  const { decisions, usage, unsent } = result
  const now = new Date()
  const byCategory = new Map<string, string[]>()
  for (const decision of decisions)
    if (decision.categoryId) byCategory.set(decision.categoryId, [...(byCategory.get(decision.categoryId) ?? []), decision.id])
  let categorized = 0
  for (const [categoryId, ids] of byCategory)
    for (let index = 0; index < ids.length; index += 90) {
      // Still uncategorized and unlocked: someone may have picked a category while Jev was answering.
      const updated = await db
        .update(transaction)
        .set({ categoryId, categorySource: "ai", aiCheckedAt: now })
        .where(and(inArray(transaction.id, ids.slice(index, index + 90)), isNull(transaction.categoryId), eq(transaction.categoryLocked, false)))
        .returning({ id: transaction.id })
      categorized += updated.length
    }
  // Unsure rows keep Jev's guess for the transaction's details, grouped so each guess is one update.
  const byGuess = new Map<string | null, string[]>([[null, [...unsent]]])
  for (const decision of decisions)
    if (!decision.categoryId) byGuess.set(decision.guessId, [...(byGuess.get(decision.guessId) ?? []), decision.id])
  for (const [aiGuessId, ids] of byGuess)
    for (let index = 0; index < ids.length; index += 90)
      await db.update(transaction).set({ aiCheckedAt: now, aiGuessId }).where(inArray(transaction.id, ids.slice(index, index + 90)))

  log(options.log, route, usage, { asked: decisions.length, categorized, durationMs: Date.now() - started })
  const [left] = await db
    .select({ count: count() })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .where(pending)
  return { asked: decisions.length, categorized, remaining: left?.count ?? 0 }
}

/** The household's spending and income categories, each described by its rules' keywords. */
async function householdCategories(householdId: string): Promise<AiCategory[]> {
  const rows = await db
    .select({ id: category.id, name: category.name, kind: category.kind })
    .from(category)
    .where(and(eq(category.householdId, householdId), ne(category.kind, "transfer")))
  const rules = await db.select({ match: rule.match, categoryId: rule.categoryId }).from(rule).where(eq(rule.householdId, householdId))
  return rows.map((row) => ({
    ...row,
    keywords: rules.filter((entry) => entry.categoryId === row.id).map((entry) => entry.match.trim()).filter(Boolean),
  }))
}

/** Which route answered, for the logs: `provider` (typesafe, vercel, cloudflare) and whose key (`keySource`). */
const where = (route: Route) => ({ provider: route.route, keySource: route.source })

/** Counts, tokens, and cost on the wide event, shaped like evlog's AI SDK fields (`ai.*`). */
function log(target: Log | undefined, route: Route, usage: Usage, counts: { asked: number; categorized: number; durationMs: number }) {
  target?.set({
    ai: {
      ...where(route),
      model: usage.model,
      calls: usage.calls,
      failedCalls: usage.failedCalls,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.inputTokens + usage.outputTokens,
      estimatedCostUsd: Number(costUsd(usage).toFixed(6)),
      ...counts,
    },
  })
  if (usage.error) target?.warn("Some AI category requests failed", { ai: { error: usage.error } })
}
