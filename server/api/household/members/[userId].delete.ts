import { and, eq } from "drizzle-orm"
import { defineHandler, HTTPError } from "h3"
import { db } from "vite-hub/database/drizzle"
import { member } from "../../../databases/config"
import { requireOwner } from "../../../utils/identity"
import { param } from "../../../utils/input"
import { moveOut } from "../../../utils/membership"
import { refuseInDemo } from "../../../demo/mode"

/** The owner removes someone; their accounts and connections go with them into a household of their own. */
export default defineHandler(async (event) => {
  refuseInDemo()
  const who = await requireOwner(event)
  const userId = param(event, "userId")
  if (userId === who.userId) throw new HTTPError({ status: 400, statusText: "To leave, use Leave household." })
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, who.householdId), eq(member.userId, userId)))
    .limit(1)
  if (!row) throw new HTTPError({ status: 404, statusText: "No such member." })
  await moveOut(who.householdId, userId)
  return { ok: true }
})
