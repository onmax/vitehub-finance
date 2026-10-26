import { asc, eq } from "drizzle-orm"
import { defineHandler } from "h3"
import { db } from "vite-hub/database/drizzle"
import { rule } from "../../databases/config"
import { requireMember } from "../../utils/identity"

export default defineHandler(async (event): Promise<Array<{ id: string; match: string; categoryId: string }>> => {
  const who = await requireMember(event)
  return db
    .select({ id: rule.id, match: rule.match, categoryId: rule.categoryId })
    .from(rule)
    .where(eq(rule.householdId, who.householdId))
    .orderBy(asc(rule.match))
})
