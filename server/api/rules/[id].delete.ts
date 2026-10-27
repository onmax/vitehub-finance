import { HTTPError } from "../../utils/http-error"
import { and, eq } from "drizzle-orm"
import { defineHandler } from "h3"
import { db } from "vite-hub/database/drizzle"
import { rule } from "../../databases/config"
import { requireMember } from "../../utils/identity"
import { param } from "../../utils/input"

export default defineHandler(async (event) => {
  const who = await requireMember(event)
  const deleted = await db
    .delete(rule)
    .where(and(eq(rule.id, param(event)), eq(rule.householdId, who.householdId)))
    .returning({ id: rule.id })
  if (!deleted.length) throw new HTTPError({ status: 404, statusText: "No such rule." })
  return { ok: true }
})
