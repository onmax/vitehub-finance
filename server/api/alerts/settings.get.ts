import { defineHandler } from "h3"
import type { AlertSettings } from "#shared/api"
import { alertSettings } from "../../utils/alerts"
import { requireMember } from "../../utils/identity"

export default defineHandler(async (event): Promise<AlertSettings> => alertSettings(await requireMember(event)))
