import { HTTPError } from "../../utils/http-error"
import { defineHandler } from "h3"
import { deleteRule } from "../../utils/categorize"
import { requireMember } from "../../utils/identity"
import { param } from "../../utils/input"

/** Deletes a rule. Categories it gave stay; what it excluded comes back where the caller may edit it. */
export default defineHandler(async (event) => {
  const who = await requireMember(event)
  if (!(await deleteRule(who, param(event)))) throw new HTTPError({ status: 404, statusText: "No such rule." })
  return { ok: true }
})
