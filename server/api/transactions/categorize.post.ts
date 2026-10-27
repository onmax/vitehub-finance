import { HTTPError } from "../../utils/http-error"
import { useLogger } from "evlog/nitro/v3"
import { defineHandler } from "h3"
import { checkRateLimit } from "vite-hub/rate-limit"
import type { AiCategorizeResult } from "#shared/api"
import { ACTION_LIMIT, aiRouteFor, categorizeWithAi } from "../../utils/ai-categorize"
import { requireMember } from "../../utils/identity"
import { refuseOverLimit } from "../../utils/rate-limit"

/**
 * "Categorize uncategorized with AI": asks Jev about up to ACTION_LIMIT of the caller's uncategorized transactions, those
 * they may both see and edit (never another member's private account or hidden row). Call again while `remaining` is
 * above zero. Each call costs AI tokens, so a person gets ten a minute, one click's worth of rounds
 * (app/composables/useAiCategorize.ts).
 */
export default defineHandler(async (event): Promise<AiCategorizeResult> => {
  const who = await requireMember(event)
  if (!(await aiRouteFor(who)))
    throw new HTTPError({ status: 404, statusText: "AI categories aren't set up. The household's owner can add a key in Settings, Categories." })
  refuseOverLimit(await checkRateLimit(event, "ai-categorize", { limit: 10, window: "1m", key: who.userId }))
  const log = useLogger(event)
  log.set({ action: "ai-categorize" })
  const outcome = await categorizeWithAi(who.householdId, { caller: who }, { limit: ACTION_LIMIT, log }).catch((error) => {
    throw new HTTPError({ status: 502, statusText: "The AI service didn't answer. Try again in a minute.", cause: error })
  })
  if (!outcome) throw new HTTPError({ status: 409, statusText: "AI categories are turned off for this household. Turn them on in Settings." })
  return outcome
})
