import { HTTPError } from "./http-error"
import { and, eq, inArray } from "drizzle-orm"

import { db } from "vite-hub/database/drizzle"
import {
  budget,
  category,
  connection,
  financialAccount,
  goal,
  member,
  recurring,
  session,
  transaction,
  user as users,
} from "../databases/config"
import { applyRulesTo } from "./categorize"
import { createHousehold } from "./household"

const chunks = <T>(items: T[], size = 80) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))

/**
 * Takes someone out of a household with their money: a fresh household of their own gets their connections and
 * accounts (with transactions and recurring rows) and their personal budgets and goals, then the membership goes.
 *
 * Categories belong to a household, so moved rows re-point to the new household's category of the same name (the
 * defaults always match). Transactions in a category the new household lacks (a custom one) lose it, unlock, and get
 * the new household's rules; personal budgets on such a category go. Household goals linked to their accounts unlink.
 */
export async function moveOut(householdId: string, userId: string) {
  const [person] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, userId)).limit(1)
  if (!person) throw new HTTPError({ status: 404, statusText: "No such member." })
  const fresh = await createHousehold(person)

  const [oldCategories, newCategories] = await Promise.all([
    db.select({ id: category.id, name: category.name }).from(category).where(eq(category.householdId, householdId)),
    db.select({ id: category.id, name: category.name }).from(category).where(eq(category.householdId, fresh)),
  ])
  const byName = new Map(newCategories.map((row) => [row.name.toLowerCase(), row.id]))
  const mapping = new Map(oldCategories.map((row) => [row.id, byName.get(row.name.toLowerCase()) ?? null]))

  await db
    .update(connection)
    .set({ householdId: fresh })
    .where(and(eq(connection.householdId, householdId), eq(connection.ownerId, userId)))
  const accounts = await db
    .update(financialAccount)
    .set({ householdId: fresh })
    .where(and(eq(financialAccount.householdId, householdId), eq(financialAccount.ownerId, userId)))
    .returning({ id: financialAccount.id })
  const accountIds = accounts.map((row) => row.id)

  for (const ids of chunks(accountIds)) {
    await db.update(transaction).set({ householdId: fresh }).where(inArray(transaction.accountId, ids))
    await db.update(recurring).set({ householdId: fresh }).where(inArray(recurring.accountId, ids))
    // Household goals stay behind; their link to an account that left goes.
    await db
      .update(goal)
      .set({ accountId: null })
      .where(and(eq(goal.householdId, householdId), inArray(goal.accountId, ids)))
  }
  for (const [from, to] of mapping)
    for (const ids of chunks(accountIds, 60)) {
      await db
        .update(transaction)
        .set(to ? { categoryId: to } : { categoryId: null, categoryLocked: false })
        .where(and(inArray(transaction.accountId, ids), eq(transaction.categoryId, from)))
      await db
        .update(recurring)
        .set({ categoryId: to })
        .where(and(inArray(recurring.accountId, ids), eq(recurring.categoryId, from)))
    }
  // They own every moved account, so the rules reach all of it.
  await applyRulesTo({ userId, householdId: fresh }, accountIds)

  const budgets = await db
    .select()
    .from(budget)
    .where(and(eq(budget.householdId, householdId), eq(budget.ownerId, userId)))
  for (const row of budgets) {
    const to = mapping.get(row.categoryId)
    if (to) await db.update(budget).set({ householdId: fresh, categoryId: to }).where(eq(budget.id, row.id))
    else await db.delete(budget).where(eq(budget.id, row.id))
  }
  const moved = new Set(accountIds)
  const goals = await db
    .select({ id: goal.id, accountId: goal.accountId })
    .from(goal)
    .where(and(eq(goal.householdId, householdId), eq(goal.ownerId, userId)))
  for (const row of goals)
    await db
      .update(goal)
      .set({ householdId: fresh, accountId: row.accountId && moved.has(row.accountId) ? row.accountId : null })
      .where(eq(goal.id, row.id))

  await db.delete(member).where(and(eq(member.organizationId, householdId), eq(member.userId, userId)))
  // Their sessions point at the household they left; identify() would fall back anyway, Better Auth's endpoints don't.
  await db
    .update(session)
    .set({ activeOrganizationId: fresh })
    .where(and(eq(session.userId, userId), eq(session.activeOrganizationId, householdId)))
  return fresh
}

/** Someone may leave unless they're the household's last owner (who would leave it without anyone to run it). */
export async function requireNotLastOwner(householdId: string, userId: string) {
  const owners = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, householdId), eq(member.role, "owner")))
  if (owners.length === 1 && owners[0]!.userId === userId)
    throw new HTTPError({ status: 409, statusText: "You're the household's only owner. Make someone else owner first." })
}
