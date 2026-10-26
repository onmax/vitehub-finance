import { and, eq } from "drizzle-orm"
import { defineHandler, HTTPError } from "h3"
import * as v from "valibot"
import { db } from "vite-hub/database/drizzle"
import type { Category } from "#shared/api"
import { category, CATEGORY_KINDS } from "../../databases/config"
import { requireMember } from "../../utils/identity"
import { Color, Icon, Name, param, readInput } from "../../utils/input"

const Body = v.object({
  name: v.optional(Name),
  kind: v.optional(v.picklist(CATEGORY_KINDS)),
  icon: v.optional(Icon),
  color: v.optional(Color),
})

export default defineHandler(async (event): Promise<Category> => {
  const who = await requireMember(event)
  const body = await readInput(event, Body)
  const where = and(eq(category.id, param(event)), eq(category.householdId, who.householdId))
  const columns = { id: category.id, name: category.name, kind: category.kind, icon: category.icon, color: category.color }
  const [row] = Object.keys(body).length
    ? await db.update(category).set(body).where(where).returning(columns)
    : await db.select(columns).from(category).where(where).limit(1)
  if (!row) throw new HTTPError({ status: 404, statusText: "No such category." })
  return row
})
