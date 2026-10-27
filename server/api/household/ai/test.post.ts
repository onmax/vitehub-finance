import { useLogger } from "evlog/nitro/v3"
import { defineHandler } from "h3"
import type { AiTestResult } from "#shared/api"
import { isDemo, refuseDemoPerson } from "../../../demo/mode"
import { AiGatewayBody, clientFor, credentialsFrom, serverClient, serverRoute, testRoute } from "../../../utils/ai-gateway"
import { HTTPError } from "../../../utils/http-error"
import { requireMember, requireOwner } from "../../../utils/identity"
import { readInput } from "../../../utils/input"

/**
 * The form's Test button: one tiny Jev question through the route in the form (stored secrets fill empty fields),
 * without saving it. Answers 200 either way; `ok: false` carries the provider's error.
 */
export default defineHandler(async (event): Promise<AiTestResult> => {
  refuseDemoPerson(await requireMember(event))
  const who = await requireOwner(event)
  if (isDemo()) throw new HTTPError({ status: 403, statusText: "Not available in the demo." })
  const input = await readInput(event, AiGatewayBody)
  const chosen = await credentialsFrom(who.householdId, input)
  const client = chosen ? clientFor(chosen.gateway, chosen.credentials) : serverClient()
  if (!client) throw new HTTPError({ status: 404, statusText: "AI categories aren't set up. The household's owner can add a key in Settings, Categories." })
  const result = await testRoute(client)
  useLogger(event).set({ action: "ai-test", ai: { provider: chosen?.gateway ?? serverRoute(), ok: result.ok } })
  return result
})
