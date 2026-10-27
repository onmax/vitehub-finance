import { useLogger } from "evlog/nitro/v3"
import { defineHandler } from "h3"
import type { AiGatewaySettings } from "#shared/api"
import { refuseDemoPerson } from "../../../demo/mode"
import { AiGatewayBody, credentialsFrom, gatewaySettings, saveGateway } from "../../../utils/ai-gateway"
import { requireMember, requireOwner } from "../../../utils/identity"
import { readInput } from "../../../utils/input"

/** The owner sets how the household reaches Jev: the server's key, or its own (sealed at rest). */
export default defineHandler(async (event): Promise<AiGatewaySettings> => {
  refuseDemoPerson(await requireMember(event))
  const who = await requireOwner(event)
  const chosen = await credentialsFrom(who.householdId, await readInput(event, AiGatewayBody))
  await saveGateway(who.householdId, chosen)
  useLogger(event).set({ action: "ai-gateway", ai: { provider: chosen?.gateway ?? "server" } })
  return gatewaySettings(who.householdId)
})
