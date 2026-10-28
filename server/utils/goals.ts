import { and, eq, isNull, or, sql } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import * as v from "valibot"
import type { Goal } from "#shared/api"
import { goal } from "../databases/config"
import { requireAccount } from "./access"
import { baseCurrency, selectAccounts } from "./accounts"
import { todayIso } from "./dates"
import { HTTPError } from "./http-error"
import type { Member } from "./identity"
import { Icon, IsoDate, Name, PositiveMinor } from "./input"

type GoalRow = typeof goal.$inferSelect
export interface GoalInput {
  name?: string
  icon?: string
  targetMinor?: number
  savedMinor?: number
  targetDate?: string | null
  accountId?: string | null
  personal?: boolean
  completed?: boolean
}
export const GoalFields = {
  name: v.optional(Name), icon: v.optional(Icon), targetMinor: v.optional(PositiveMinor), savedMinor: v.optional(PositiveMinor),
  targetDate: v.optional(v.nullable(IsoDate)), accountId: v.optional(v.nullable(v.string())), personal: v.optional(v.boolean()), completed: v.optional(v.boolean()),
}
const mine = (who: Member) => and(eq(goal.householdId, who.householdId), or(isNull(goal.ownerId), eq(goal.ownerId, who.userId)))

export function monthsUntil(today: string, targetDate: string) {
  const [y1, m1, d1] = today.split("-").map(Number) as [number, number, number]
  const [y2, m2, d2] = targetDate.split("-").map(Number) as [number, number, number]
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + (d2 >= d1 ? 0 : -1))
}

export async function listGoals(who: Member): Promise<Goal[]> {
  const { convert } = await baseCurrency(who)
  const accounts = await selectAccounts(who, "household")
  const access = new Map(accounts.map(({ account }) => [account.id, account]))
  const audienceMatches = (row: GoalRow) => {
    const account = row.accountId ? access.get(row.accountId) : undefined
    return !!account && (row.ownerId ? account.visibility === "private" && account.ownerId === row.ownerId : account.visibility === "household")
  }
  const balances = new Map(accounts.map(({ account }) => [account.id, Math.max(0, convert(account.balanceMinor, account.currency))]))
  const rows = await db.select().from(goal).where(mine(who)).orderBy(goal.createdAt, goal.id)
  // Account-backed allocations have the same audience as their account. Legacy links need explicit review first.
  const accepted = rows.filter(row => row.accountId && row.allocationReviewed && !row.completedAt && audienceMatches(row))
  const funded = new Map<string, number>()
  for (const [accountId, balance] of balances) {
    const allocations = accepted.filter(row => row.accountId === accountId)
    const total = allocations.reduce((sum, row) => sum + row.savedMinor, 0)
    let remaining = Math.min(balance, total)
    for (const row of allocations) {
      const amount = Math.floor(row.savedMinor * Math.min(1, balance / Math.max(1, total)))
      funded.set(row.id, amount)
      remaining -= amount
    }
    for (const row of allocations) {
      if (remaining <= 0) break
      const current = funded.get(row.id) ?? 0
      if (current < row.savedMinor) { funded.set(row.id, current + 1); remaining-- }
    }
  }
  return rows.map(row => {
    const unavailable = row.accountId !== null && !balances.has(row.accountId)
    const needsReview = row.accountId !== null && (!row.allocationReviewed || !audienceMatches(row))
    const savedMinor = unavailable ? 0 : row.savedMinor
    const progressMinor = row.completedAt ? savedMinor : row.accountId ? funded.get(row.id) ?? 0 : savedMinor
    const remaining = Math.max(0, row.targetMinor - progressMinor)
    return {
      id: row.id, name: row.name, icon: row.icon, ownerId: row.ownerId, targetMinor: row.targetMinor, savedMinor,
      targetDate: row.targetDate, accountId: unavailable ? null : row.accountId, progressMinor,
      shortfallMinor: unavailable || needsReview || row.completedAt ? 0 : Math.max(0, savedMinor - progressMinor),
      fundingUnavailable: unavailable, allocationNeedsReview: needsReview && !unavailable, completedAt: row.completedAt?.toISOString() ?? null,
      monthlyNeededMinor: row.targetDate && !row.completedAt ? Math.ceil(remaining / monthsUntil(todayIso(), row.targetDate)) : null,
    }
  })
}

async function requireGoal(who: Member, id: string) {
  const [row] = await db.select().from(goal).where(and(eq(goal.id, id), mine(who))).limit(1)
  if (!row) throw new HTTPError({ status: 404, statusText: "No such goal." })
  return row
}
async function oneGoal(who: Member, id: string) {
  const row = (await listGoals(who)).find(row => row.id === id)
  if (!row) throw new HTTPError({ status: 404, statusText: "No such goal." })
  return row
}
async function allocationLimit(who: Member, accountId: string, personal: boolean) {
  const account = await requireAccount(who, accountId, "edit")
  // A private allocation on shared cash would disclose its size through the household's remaining cash.
  if (personal ? account.visibility !== "private" || account.ownerId !== who.userId : account.visibility !== "household")
    throw new HTTPError({ status: 400, statusText: "Use a private account for a personal goal and a shared account for a shared goal." })
  const { convert } = await baseCurrency(who)
  return Math.max(0, convert(account.balanceMinor, account.currency))
}
const reserved = (accountId: string, except: string) => sql`(select coalesce(sum(saved_minor), 0) from goal where account_id = ${accountId} and id != ${except} and completed_at is null and allocation_reviewed = 1)`
const allocationError = () => new HTTPError({ status: 409, statusText: "The allocation exceeds the account's unallocated balance." })

export async function createGoal(who: Member, input: GoalInput & { name: string; targetMinor: number }) {
  if (input.targetMinor <= 0) throw new HTTPError({ status: 400, statusText: "A goal target must be above zero." })
  const id = crypto.randomUUID()
  const accountId = input.accountId ?? null
  const saved = input.savedMinor ?? 0
  const ownerId = input.personal ? who.userId : null
  if (accountId) {
    const cap = await allocationLimit(who, accountId, !!input.personal)
    const inserted = await db.all<{ id: string }>(sql`insert into goal (id, household_id, owner_id, name, icon, target_minor, saved_minor, allocation_reviewed, target_date, account_id)
      select ${id}, ${who.householdId}, ${ownerId}, ${input.name}, ${input.icon ?? "i-lucide-target"}, ${input.targetMinor}, ${saved}, 1, ${input.targetDate ?? null}, ${accountId}
      where ${saved} <= ${cap} - ${reserved(accountId, id)} returning id`)
    if (!inserted.length) throw allocationError()
  } else {
    await db.insert(goal).values({ id, householdId: who.householdId, ownerId, name: input.name, icon: input.icon ?? "i-lucide-target", targetMinor: input.targetMinor, savedMinor: saved, allocationReviewed: true, targetDate: input.targetDate ?? null })
  }
  return oneGoal(who, id)
}

export async function updateGoal(who: Member, id: string, input: GoalInput) {
  const row = await requireGoal(who, id)
  if (input.targetMinor !== undefined && input.targetMinor <= 0) throw new HTTPError({ status: 400, statusText: "A goal target must be above zero." })
  const accountId = input.accountId === undefined ? row.accountId : input.accountId
  const personal = input.personal ?? row.ownerId !== null
  const saved = input.savedMinor ?? row.savedMinor
  const set: Partial<typeof goal.$inferInsert> = {}
  for (const field of ["name", "icon", "targetMinor", "savedMinor", "targetDate", "accountId"] as const)
    if (input[field] !== undefined) Object.assign(set, { [field]: input[field] })
  if (input.personal !== undefined) set.ownerId = input.personal ? who.userId : null
  if (input.completed !== undefined) set.completedAt = input.completed ? new Date() : null
  const allocates = input.savedMinor !== undefined || input.accountId !== undefined || input.personal !== undefined || input.completed === false
  if (allocates) set.allocationReviewed = true
  let constraint = and(eq(goal.id, id), mine(who))
  if (accountId && allocates && !input.completed) {
    const cap = await allocationLimit(who, accountId, personal)
    constraint = and(constraint, sql`${saved} <= ${cap} - ${reserved(accountId, id)}`)
  }
  if (Object.keys(set).length) {
    const updated = await db.update(goal).set(set).where(constraint).returning({ id: goal.id })
    if (!updated.length) throw allocationError()
  }
  return oneGoal(who, id)
}
export async function deleteGoal(who: Member, id: string) {
  await requireGoal(who, id)
  await db.delete(goal).where(and(eq(goal.id, id), mine(who)))
}
