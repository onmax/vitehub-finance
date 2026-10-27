import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import { db } from "vite-hub/database/drizzle"
import { category } from "../databases/config"
import { HTTPError } from "./http-error"

/** What a rule does, as the rules API reads it. */
export const RuleAction = v.object({
  categoryId: v.optional(v.nullable(v.string()), null),
  exclude: v.optional(v.boolean(), false),
})

/** A 400 unless `categoryId` (when given) is one of the household's categories. */
export async function requireCategory(householdId: string, categoryId: string | null) {
  if (!categoryId) return
  const [found] = await db
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.id, categoryId), eq(category.householdId, householdId)))
    .limit(1)
  if (!found) throw new HTTPError({ status: 400, statusText: "No such category." })
}
