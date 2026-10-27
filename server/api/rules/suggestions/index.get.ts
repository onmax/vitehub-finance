import { defineHandler } from "h3"
import type { RuleSuggestion } from "#shared/api"
import { requireMember } from "../../../utils/identity"
import { listRuleSuggestions } from "../../../utils/rules"

/** Rules the caller's transactions call for (server/utils/rule-suggestions-core.ts). */
export default defineHandler(async (event): Promise<RuleSuggestion[]> => listRuleSuggestions(await requireMember(event)))
