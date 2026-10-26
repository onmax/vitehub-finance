import { asc, eq, sql } from "drizzle-orm"
import { defineHandler } from "h3"
import { db } from "vite-hub/database/drizzle"
import type { Category } from "#shared/api"
import { category } from "../../databases/config"
import { requireMember } from "../../utils/identity"

/** The household's categories: spending first, then income, then transfers, each by name. */
export default defineHandler(async (event): Promise<Category[]> => {
  const who = await requireMember(event)
  return db
    .select({ id: category.id, name: category.name, kind: category.kind, icon: category.icon, color: category.color })
    .from(category)
    .where(eq(category.householdId, who.householdId))
    .orderBy(sql`case ${category.kind} when 'expense' then 0 when 'income' then 1 else 2 end`, asc(category.name))
})
