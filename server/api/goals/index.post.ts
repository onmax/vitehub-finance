import { defineHandler } from "h3"
import * as v from "valibot"
import type { Goal } from "#shared/api"
import { createGoal, GoalFields } from "../../utils/goals"
import { requireMember } from "../../utils/identity"
import { Name, PositiveMinor, readInput } from "../../utils/input"

const Body = v.object({ ...GoalFields, name: Name, targetMinor: PositiveMinor })

/** Account-backed progress uses an explicit allocation within the account’s unallocated cash. */
export default defineHandler(async (event): Promise<Goal> => {
  const who = await requireMember(event)
  return createGoal(who, await readInput(event, Body))
})
