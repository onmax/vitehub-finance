import { defineHandler } from "h3"
import * as v from "valibot"
import type { Goal } from "#shared/api"
import { createGoal, GoalFields } from "../../utils/goals"
import { requireMember } from "../../utils/identity"
import { Name, PositiveMinor, readInput } from "../../utils/input"

const Body = v.object({ ...GoalFields, name: Name, targetMinor: PositiveMinor })

/** Linked to an account (`accountId`, one the caller can see), progress follows its balance. */
export default defineHandler(async (event): Promise<Goal> => {
  const who = await requireMember(event)
  return createGoal(who, await readInput(event, Body))
})
