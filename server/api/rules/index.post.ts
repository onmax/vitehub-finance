import { and, eq } from "drizzle-orm"
import { defineHandler, HTTPError } from "h3"
import * as v from "valibot"
import { db } from "vite-hub/database/drizzle"
import { category } from "../../databases/config"
import { applyRule, ensureRule } from "../../utils/categorize"
import { requireMember } from "../../utils/identity"
import { readInput } from "../../utils/input"

const Body = v.object({
  match: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.minLength(2), v.maxLength(120)),
  categoryId: v.string(),
})

/** A new rule also categorizes the caller's existing uncategorized transactions that match it. */
export default defineHandler(async (event) => {
  const who = await requireMember(event)
  const body = await readInput(event, Body)
  const [found] = await db
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.id, body.categoryId), eq(category.householdId, who.householdId)))
    .limit(1)
  if (!found) throw new HTTPError({ status: 400, statusText: "No such category." })
  const row = await ensureRule(who.householdId, body.match, body.categoryId)
  await applyRule(who, body.match, body.categoryId)
  return { id: row.id, match: row.match, categoryId: row.categoryId }
})
