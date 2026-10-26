import { defineHandler, HTTPError } from "h3"
import { requireMember } from "../../utils/identity"
import { moveOut, requireNotLastOwner } from "../../utils/membership"

/** Leave the household, taking your accounts and connections into a household of your own. */
export default defineHandler(async (event) => {
  const who = await requireMember(event)
  if (who.via !== "browser") throw new HTTPError({ status: 403, statusText: "Leave a household in the browser." })
  await requireNotLastOwner(who.householdId, who.userId)
  await moveOut(who.householdId, who.userId)
  return { ok: true }
})
