import { defineHandler } from "h3"
import type { Rule } from "#shared/api"
import { requireMember } from "../../utils/identity"
import { listRules } from "../../utils/rules"

/** The household's rules, with how many of the caller's transactions each matches. */
export default defineHandler(async (event): Promise<Rule[]> => listRules(await requireMember(event)))
