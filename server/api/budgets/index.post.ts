import { defineHandler } from "h3"
import * as v from "valibot"
import type { Budget } from "#shared/api"
import { createBudget } from "../../utils/budgets"
import { isIsoMonth } from "../../utils/dates"
import { requireMember } from "../../utils/identity"
import { PositiveMinor, readInput } from "../../utils/input"

const Body = v.object({
  categoryId: v.string(), amountMinor: PositiveMinor, personal: v.optional(v.boolean()),
  effectiveMonth: v.optional(v.pipe(v.string(), v.check(isIsoMonth, "month must be YYYY-MM."))),
  carryEnabled: v.optional(v.boolean()),
})

/** `personal: true` makes it the caller's own budget, counting only their accounts. */
export default defineHandler(async (event): Promise<Budget> => {
  const who = await requireMember(event)
  return createBudget(who, await readInput(event, Body))
})
