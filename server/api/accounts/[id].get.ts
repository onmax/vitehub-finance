import { defineHandler, HTTPError } from "h3"
import type { AccountDetail } from "#shared/api"
import { accountDetail } from "../../utils/accounts"
import { requireMember } from "../../utils/identity"
import { param } from "../../utils/input"

/** One visible account with holdings and 180 days of daily balances. Someone else's private account is a 404. */
export default defineHandler(async (event): Promise<AccountDetail> => {
  const who = await requireMember(event)
  const detail = await accountDetail(who, param(event))
  if (!detail) throw new HTTPError({ status: 404, statusText: "No such account." })
  return detail
})
