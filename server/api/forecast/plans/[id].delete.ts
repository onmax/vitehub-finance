import { defineHandler } from 'h3'
import { requireMember } from '../../../utils/identity'
import { param } from '../../../utils/input'
import { deleteForecastPlan } from '../../../utils/forecast-plans'
export default defineHandler(async event => { await deleteForecastPlan(await requireMember(event), param(event)); return { ok: true } })
