import { defineHandler } from "h3"
import { requireMember } from "../../utils/identity"
import { moveOut, requireNotLastOwner } from "../../utils/membership"
import { refuseDemoPerson } from "../../demo/mode"

/** Leave the household, taking your accounts and connections into a household of your own. In the browser only. */
export default defineHandler(async (event) => {
  const who = await requireMember(event)
  refuseDemoPerson(who)
  await requireNotLastOwner(who.householdId, who.userId)
  await moveOut(who.householdId, who.userId)
  return { ok: true }
})
