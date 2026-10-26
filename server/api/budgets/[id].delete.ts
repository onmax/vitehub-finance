import { defineHandler } from "h3"
import { deleteBudget } from "../../utils/budgets"
import { requireMember } from "../../utils/identity"
import { param } from "../../utils/input"

export default defineHandler(async (event) => {
  const who = await requireMember(event)
  await deleteBudget(who, param(event))
  return { ok: true }
})
