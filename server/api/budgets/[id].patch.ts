import { defineHandler } from "h3"
import * as v from "valibot"
import type { Budget } from "#shared/api"
import { updateBudget } from "../../utils/budgets"
import { requireMember } from "../../utils/identity"
import { param, PositiveMinor, readInput } from "../../utils/input"

const Body = v.object({
  categoryId: v.optional(v.string()),
  amountMinor: v.optional(PositiveMinor),
  personal: v.optional(v.boolean()),
})

export default defineHandler(async (event): Promise<Budget> => {
  const who = await requireMember(event)
  return updateBudget(who, param(event), await readInput(event, Body))
})
