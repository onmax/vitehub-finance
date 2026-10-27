import { defineHandler } from "h3"
import type { AiGatewaySettings } from "#shared/api"
import { gatewaySettings } from "../../../utils/ai-gateway"
import { requireOwner } from "../../../utils/identity"

/** The household's route for AI categories, for its owner's form: no secrets, only that each is set and its last 4. */
export default defineHandler(async (event): Promise<AiGatewaySettings> => {
  const who = await requireOwner(event)
  return gatewaySettings(who.householdId)
})
