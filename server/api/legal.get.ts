import { defineHandler } from "h3"
import { useServerEnv } from "#vitehub/env/server"
import type { LegalInfo } from "#shared/api"
import { aiRouteFor } from "../utils/ai-categorize"
import { serverRoute } from "../utils/ai-gateway"
import { identify } from "../utils/identity"

/**
 * Public, for /privacy: the instance's contact address (`FINANCE_CONTACT_EMAIL`), if its operator set one, and where AI
 * categories go: the signed-in household's route, or the server's for anyone else.
 */
export default defineHandler(async (event): Promise<LegalInfo> => {
  const email = useServerEnv().finance.contactEmail?.trim()
  const who = await identify(event).catch(() => null)
  const ai = who ? ((await aiRouteFor(who))?.route ?? null) : serverRoute()
  return { contactEmail: email || null, ai }
})
