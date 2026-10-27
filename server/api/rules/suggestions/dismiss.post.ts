import { defineHandler } from "h3"
import * as v from "valibot"
import { requireMember } from "../../../utils/identity"
import { readInput } from "../../../utils/input"
import { dismissRuleSuggestion } from "../../../utils/rules"

/** Dismisses a rule suggestion (`{ key }`) for the household. */
export default defineHandler(async (event) => {
  const who = await requireMember(event)
  const { key } = await readInput(event, v.object({ key: v.pipe(v.string(), v.minLength(1), v.maxLength(200)) }))
  await dismissRuleSuggestion(who.householdId, key)
  return { ok: true }
})
