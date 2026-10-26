import { and, eq, isNull, or } from "drizzle-orm"
import { HTTPError } from "h3"
import { db } from "vite-hub/database/drizzle"
import type { Goal } from "#shared/api"
import { goal } from "../databases/config"
import { requireAccount } from "./access"
import { baseCurrency, selectAccounts, type Converter } from "./accounts"
import { todayIso } from "./dates"
import type { Member } from "./identity"
import { Icon, IsoDate, Name, PositiveMinor } from "./input"
import * as v from "valibot"

type GoalRow = typeof goal.$inferSelect

export interface GoalInput {
  name?: string
  icon?: string
  targetMinor?: number
  savedMinor?: number
  targetDate?: string | null
  accountId?: string | null
  personal?: boolean
}

/** A goal's fields for the routes; POST requires name and target, PATCH takes any of them. */
export const GoalFields = {
  name: v.optional(Name),
  icon: v.optional(Icon),
  targetMinor: v.optional(PositiveMinor),
  savedMinor: v.optional(PositiveMinor),
  targetDate: v.optional(v.nullable(IsoDate)),
  accountId: v.optional(v.nullable(v.string())),
  personal: v.optional(v.boolean()),
}

const mine = (who: Member) => and(eq(goal.householdId, who.householdId), or(isNull(goal.ownerId), eq(goal.ownerId, who.userId)))

/** Whole months from today to the target date, at least one; the month of the date counts when its day is ahead. */
export function monthsUntil(today: string, targetDate: string) {
  const [y1, m1, d1] = today.split("-").map(Number) as [number, number, number]
  const [y2, m2, d2] = targetDate.split("-").map(Number) as [number, number, number]
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + (d2 >= d1 ? 0 : -1))
}

/**
 * A goal as the caller sees it. Linked to an account they can see, progress is its balance in the household's
 * currency; linked to one they can't (a partner's private savings), the link and its balance stay hidden and
 * progress falls back to `savedMinor`.
 */
function toGoal(row: GoalRow, balances: Map<string, number>, today: string): Goal {
  const linked = row.accountId !== null && balances.has(row.accountId)
  const progressMinor = linked ? balances.get(row.accountId!)! : row.savedMinor
  const remaining = Math.max(0, row.targetMinor - progressMinor)
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    ownerId: row.ownerId,
    targetMinor: row.targetMinor,
    savedMinor: row.savedMinor,
    targetDate: row.targetDate,
    accountId: linked ? row.accountId : null,
    progressMinor,
    monthlyNeededMinor: row.targetDate ? Math.ceil(remaining / monthsUntil(today, row.targetDate)) : null,
  }
}

async function visibleBalances(who: Member, convert: Converter) {
  const rows = await selectAccounts(who, "household")
  return new Map(rows.map((row) => [row.account.id, convert(row.account.balanceMinor, row.account.currency)]))
}

export async function listGoals(who: Member): Promise<Goal[]> {
  const { convert } = await baseCurrency(who)
  const balances = await visibleBalances(who, convert)
  const rows = await db.select().from(goal).where(mine(who)).orderBy(goal.createdAt)
  const today = todayIso()
  return rows.map((row) => toGoal(row, balances, today))
}

async function oneGoal(who: Member, row: GoalRow) {
  const { convert } = await baseCurrency(who)
  return toGoal(row, await visibleBalances(who, convert), todayIso())
}

async function requireGoal(who: Member, id: string) {
  const [row] = await db
    .select()
    .from(goal)
    .where(and(eq(goal.id, id), mine(who)))
    .limit(1)
  if (!row) throw new HTTPError({ status: 404, statusText: "No such goal." })
  return row
}

export async function createGoal(who: Member, input: GoalInput & { name: string; targetMinor: number }) {
  if (input.accountId) await requireAccount(who, input.accountId)
  const [row] = await db
    .insert(goal)
    .values({
      id: crypto.randomUUID(),
      householdId: who.householdId,
      ownerId: input.personal ? who.userId : null,
      name: input.name,
      icon: input.icon ?? "i-lucide-target",
      targetMinor: input.targetMinor,
      savedMinor: input.savedMinor ?? 0,
      targetDate: input.targetDate ?? null,
      accountId: input.accountId ?? null,
    })
    .returning()
  return oneGoal(who, row!)
}

export async function updateGoal(who: Member, id: string, input: GoalInput) {
  const row = await requireGoal(who, id)
  if (input.accountId) await requireAccount(who, input.accountId)
  const set: Partial<typeof goal.$inferInsert> = {}
  for (const field of ["name", "icon", "targetMinor", "savedMinor", "targetDate", "accountId"] as const)
    if (input[field] !== undefined) Object.assign(set, { [field]: input[field] })
  if (input.personal !== undefined) set.ownerId = input.personal ? who.userId : null
  if (!Object.keys(set).length) return oneGoal(who, row)
  const [updated] = await db.update(goal).set(set).where(eq(goal.id, id)).returning()
  return oneGoal(who, updated!)
}

export async function deleteGoal(who: Member, id: string) {
  await requireGoal(who, id)
  await db.delete(goal).where(eq(goal.id, id))
}
