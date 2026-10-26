import { defineHandler } from "h3"
import type { RecurringResponse } from "#shared/api"
import { scopeOf } from "../../utils/access"
import { requireMember } from "../../utils/identity"
import { recurringOverview } from "../../utils/recurring"

export default defineHandler(async (event): Promise<RecurringResponse> => recurringOverview(await requireMember(event), scopeOf(event)))
