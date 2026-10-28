import { defineHandler } from "h3"
import { requireMember } from "../../utils/identity"
import { param } from "../../utils/input"
import { HTTPError } from "../../utils/http-error"
import { getTransaction } from "../../utils/transactions"

export default defineHandler(async (event) => {
  const row = await getTransaction(await requireMember(event), param(event))
  if (!row) throw new HTTPError({ status: 404, statusText: "No such transaction." })
  return row
})
