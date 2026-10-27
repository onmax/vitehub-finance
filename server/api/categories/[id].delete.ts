import { HTTPError } from "../../utils/http-error"
import { and, eq } from "drizzle-orm"
import { defineHandler } from "h3"
import { db } from "vite-hub/database/drizzle"
import { budget, category, recurring, rule, transaction } from "../../databases/config"
import { requireMember } from "../../utils/identity"
import { param } from "../../utils/input"

/** Its transactions become uncategorized (and open to rules again); its rules and budgets go with it. */
export default defineHandler(async (event) => {
  const who = await requireMember(event)
  const id = param(event)
  const [row] = await db
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.id, id), eq(category.householdId, who.householdId)))
    .limit(1)
  if (!row) throw new HTTPError({ status: 404, statusText: "No such category." })
  await db.update(transaction).set({ categoryId: null, categoryLocked: false }).where(eq(transaction.categoryId, id))
  await db.update(recurring).set({ categoryId: null }).where(eq(recurring.categoryId, id))
  await db.delete(rule).where(eq(rule.categoryId, id))
  await db.delete(budget).where(eq(budget.categoryId, id))
  await db.delete(category).where(eq(category.id, id))
  return { ok: true }
})
