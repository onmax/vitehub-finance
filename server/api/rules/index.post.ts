import { HTTPError } from "../../utils/http-error"
import { defineHandler } from "h3"
import * as v from "valibot"
import { applyRule, ensureRule } from "../../utils/categorize"
import { requireMember } from "../../utils/identity"
import { readInput } from "../../utils/input"
import { RuleAction, requireCategory } from "../../utils/rule-input"

const Body = v.object({
  match: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.minLength(2), v.maxLength(120)),
  ...RuleAction.entries,
})

/**
 * A rule for `match` (or the household's rule for it, updated): files matches under `categoryId`, excludes them with
 * `exclude`, or both. It also acts on the caller's existing transactions that match.
 */
export default defineHandler(async (event) => {
  const who = await requireMember(event)
  const body = await readInput(event, Body)
  if (!body.categoryId && !body.exclude) throw new HTTPError({ status: 400, statusText: "A rule needs a category, or to exclude what it matches." })
  await requireCategory(who.householdId, body.categoryId)
  const row = await ensureRule(who.householdId, body.match, body)
  await applyRule(who, row)
  return { id: row.id, match: row.match, categoryId: row.categoryId, exclude: row.exclude }
})
