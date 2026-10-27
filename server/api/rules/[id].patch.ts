import { HTTPError } from "../../utils/http-error"
import { defineHandler } from "h3"
import { setRule } from "../../utils/categorize"
import { requireMember } from "../../utils/identity"
import { param, readInput } from "../../utils/input"
import { RuleAction, requireCategory } from "../../utils/rule-input"

/** A rule's new category and `exclude`. Turning `exclude` off brings back what it excluded. */
export default defineHandler(async (event) => {
  const who = await requireMember(event)
  const body = await readInput(event, RuleAction)
  if (!body.categoryId && !body.exclude) throw new HTTPError({ status: 400, statusText: "A rule needs a category, or to exclude what it matches." })
  await requireCategory(who.householdId, body.categoryId)
  const saved = await setRule(who, param(event), body)
  if (!saved) throw new HTTPError({ status: 404, statusText: "No such rule." })
  return { id: saved.id, match: saved.match, categoryId: saved.categoryId, exclude: saved.exclude }
})
