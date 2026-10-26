import { defineHandler } from "h3"
import * as v from "valibot"
import type { Goal } from "#shared/api"
import { GoalFields, updateGoal } from "../../utils/goals"
import { requireMember } from "../../utils/identity"
import { param, readInput } from "../../utils/input"

export default defineHandler(async (event): Promise<Goal> => {
  const who = await requireMember(event)
  return updateGoal(who, param(event), await readInput(event, v.object(GoalFields)))
})
