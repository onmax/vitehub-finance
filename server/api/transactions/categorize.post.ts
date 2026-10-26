import { useLogger } from "evlog/nitro/v3"
import { defineHandler, HTTPError } from "h3"
import type { AiCategorizeResult } from "#shared/api"
import { ACTION_LIMIT, aiAvailable, categorizeWithAi } from "../../utils/ai-categorize"
import { editableAccounts } from "../../utils/categorize"
import { requireMember } from "../../utils/identity"

/**
 * "Categorize uncategorized with AI": asks Jev about up to ACTION_LIMIT of the caller's uncategorized transactions, on
 * accounts they may edit (never another member's private account). Call again while `remaining` is above zero.
 */
export default defineHandler(async (event): Promise<AiCategorizeResult> => {
  const who = await requireMember(event)
  if (!aiAvailable()) throw new HTTPError({ status: 404, statusText: "AI categories aren't set up on this server." })
  const log = useLogger(event)
  log.set({ action: "ai-categorize" })
  const outcome = await categorizeWithAi(who.householdId, editableAccounts(who), { limit: ACTION_LIMIT, log }).catch((error) => {
    throw new HTTPError({ status: 502, statusText: "The AI service didn't answer. Try again in a minute.", cause: error })
  })
  if (!outcome) throw new HTTPError({ status: 409, statusText: "AI categories are turned off for this household (Settings)." })
  return outcome
})
