import { defineHandler } from "h3"
import * as v from "valibot"
import { db } from "vite-hub/database/drizzle"
import type { Category } from "#shared/api"
import { category, CATEGORY_KINDS } from "../../databases/config"
import { requireMember } from "../../utils/identity"
import { Color, Icon, Name, readInput } from "../../utils/input"

const Body = v.object({
  name: Name,
  kind: v.optional(v.picklist(CATEGORY_KINDS), "expense"),
  icon: v.optional(Icon, "i-lucide-circle-help"),
  color: v.optional(Color, "neutral"),
})

export default defineHandler(async (event): Promise<Category> => {
  const who = await requireMember(event)
  const body = await readInput(event, Body)
  const [row] = await db
    .insert(category)
    .values({ id: crypto.randomUUID(), householdId: who.householdId, ...body })
    .returning({ id: category.id, name: category.name, kind: category.kind, icon: category.icon, color: category.color })
  return row!
})
