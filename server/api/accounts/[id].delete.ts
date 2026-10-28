import { HTTPError } from "../../utils/http-error"
import { defineHandler } from "h3"
import { canManage } from "#shared/access"
import { requireAccount } from "../../utils/access"
import { requireMember } from "../../utils/identity"
import { param } from "../../utils/input"
import { refuseDemoPerson } from "../../demo/mode"
import { eraseAccounts } from "../../utils/finance-lifecycle"

/** The owner deletes an account with its history. Dependent rows go explicitly: SQLite may run without foreign keys. */
export default defineHandler(async (event) => {
  refuseDemoPerson(await requireMember(event))
  const who = await requireMember(event)
  const account = await requireAccount(who, param(event))
  if (!canManage(account, who.userId)) throw new HTTPError({ status: 403, statusText: "Only the account's owner can delete it." })
  await eraseAccounts([account.id])
  return { ok: true }
})
