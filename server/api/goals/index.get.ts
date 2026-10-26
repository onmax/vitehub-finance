import { defineHandler } from "h3"
import type { Goal } from "#shared/api"
import { listGoals } from "../../utils/goals"
import { requireMember } from "../../utils/identity"

export default defineHandler(async (event): Promise<Goal[]> => listGoals(await requireMember(event)))
