import { defineHandler } from 'h3'
import { requireMember } from '../../../utils/identity'
import { listForecastPlans } from '../../../utils/forecast-plans'
export default defineHandler(async event => listForecastPlans(await requireMember(event)))
