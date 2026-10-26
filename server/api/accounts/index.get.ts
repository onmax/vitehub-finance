import { defineHandler } from "h3"
import type { AccountSummary } from "#shared/api"
import { scopeOf } from "../../utils/access"
import { listAccounts } from "../../utils/accounts"
import { requireMember } from "../../utils/identity"

/** Visible accounts sorted by kind, then name; archived ones only with `archived=1`. */
export default defineHandler(async (event): Promise<AccountSummary[]> => {
  const who = await requireMember(event)
  return listAccounts(who, { scope: scopeOf(event), archived: event.url.searchParams.get("archived") === "1" })
})
