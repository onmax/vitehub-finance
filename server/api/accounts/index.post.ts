import { defineHandler } from "h3"
import * as v from "valibot"
import type { AccountSummary } from "#shared/api"
import { accountSummary } from "../../utils/accounts"
import { requireMember } from "../../utils/identity"
import { Currency, Holdings, Kind, Minor, Name, Permission, readInput, Visibility } from "../../utils/input"
import { createManualAccount } from "../../utils/manual-accounts"

const Body = v.object({
  name: Name,
  kind: Kind,
  currency: Currency,
  balanceMinor: v.optional(Minor, 0),
  holdings: v.optional(Holdings),
  visibility: v.optional(Visibility),
  householdPermission: v.optional(Permission),
  institution: v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(120)))),
})

/** A manual account (server/utils/manual-accounts.ts), owned by the caller. */
export default defineHandler(async (event): Promise<AccountSummary> => {
  const who = await requireMember(event)
  const id = await createManualAccount(who, await readInput(event, Body))
  return (await accountSummary(who, id))!
})
