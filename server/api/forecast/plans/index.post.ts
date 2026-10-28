import { defineHandler } from 'h3'
import { requireMember } from '../../../utils/identity'
import { readInput } from '../../../utils/input'
import { PlanBody, saveForecastPlan } from '../../../utils/forecast-plans'
export default defineHandler(async event => saveForecastPlan(await requireMember(event), await readInput(event, PlanBody)))
