import { defineHandler } from "h3"
import * as v from "valibot"
import { requireMember } from "../../utils/identity"
import { readInput } from "../../utils/input"
import { undoTransactionBulk } from "../../utils/transactions"

export default defineHandler(async (event) => {
  const who = await requireMember(event)
  const { token } = await readInput(event, v.object({ token: v.pipe(v.string(), v.uuid()) }))
  return undoTransactionBulk(who, token)
})
