import { defineHandler } from "h3"
import type { AlertsResponse } from "#shared/api"
import { listAlerts } from "../../utils/alerts"
import { requireMember } from "../../utils/identity"

/** The caller's alerts, open and dismissed, most urgent first. */
export default defineHandler(async (event): Promise<AlertsResponse> => listAlerts(await requireMember(event)))
