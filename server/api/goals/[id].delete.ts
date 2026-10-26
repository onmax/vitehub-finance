import { defineHandler } from "h3"
import { deleteGoal } from "../../utils/goals"
import { requireMember } from "../../utils/identity"
import { param } from "../../utils/input"

export default defineHandler(async (event) => {
  const who = await requireMember(event)
  await deleteGoal(who, param(event))
  return { ok: true }
})
