import { HTTPError } from "../../utils/http-error"
import { eq } from "drizzle-orm"
import { defineHandler } from "h3"
import * as v from "valibot"
import { db } from "vite-hub/database/drizzle"
import type { AccountSummary } from "#shared/api"
import { canEdit, canManage } from "#shared/access"
import { financialAccount } from "../../databases/config"
import { requireAccount } from "../../utils/access"
import { accountSummary } from "../../utils/accounts"
import { requireMember } from "../../utils/identity"
import { setManualHoldings } from "../../utils/holdings"
import { setMyInvestorUnits } from "../../utils/myinvestor"
import { Holdings, Kind, Minor, Name, param, Permission, readInput, Visibility } from "../../utils/input"
import { recordSnapshot } from "../../utils/snapshots"

const Body = v.object({
  name: v.optional(Name),
  kind: v.optional(Kind),
  visibility: v.optional(Visibility),
  householdPermission: v.optional(Permission),
  includeInNetWorth: v.optional(v.boolean()),
  archived: v.optional(v.boolean()),
  balanceMinor: v.optional(Minor),
  holdings: v.optional(Holdings),
})

/**
 * Who sees an account and what others may do with it is the owner's call (`canManage`); renaming, archiving, and the
 * rest need `canEdit`. A synced account's balance comes from its provider, so only manual ones take `balanceMinor`, or
 * `holdings` (what it holds, which then sets the balance at today's prices). A MyInvestor account takes `holdings` too:
 * MyInvestor can't report its units, so they're its connection's credentials.
 */
export default defineHandler(async (event): Promise<AccountSummary> => {
  const who = await requireMember(event)
  const account = await requireAccount(who, param(event))
  const body = await readInput(event, Body)
  if ((body.visibility !== undefined || body.householdPermission !== undefined) && !canManage(account, who.userId))
    throw new HTTPError({ status: 403, statusText: "Only the account's owner can change who sees it." })
  const { visibility, householdPermission, balanceMinor, holdings, ...rest } = body
  const values = balanceMinor !== undefined || holdings !== undefined
  if ((Object.keys(rest).length || values) && !canEdit(account, who.userId))
    throw new HTTPError({ status: 403, statusText: "You can view this account but not edit it." })
  if (balanceMinor !== undefined && account.connectionId)
    throw new HTTPError({ status: 400, statusText: "You can't edit a connected account's balance. It updates when the connection syncs." })
  if (balanceMinor !== undefined && holdings !== undefined)
    throw new HTTPError({ status: 400, statusText: "Send holdings or a balance, not both: holdings set the balance." })
  // A connection that refuses new units fails before anything else changes.
  if (holdings !== undefined && account.connectionId) await setMyInvestorUnits(who, account.connectionId, holdings)
  const set = {
    ...rest,
    ...(visibility ? { visibility } : {}),
    ...(householdPermission ? { householdPermission } : {}),
    ...(balanceMinor !== undefined ? { balanceMinor, balanceUpdatedAt: new Date() } : {}),
  }
  if (Object.keys(set).length) await db.update(financialAccount).set(set).where(eq(financialAccount.id, account.id))
  if (balanceMinor !== undefined) await recordSnapshot(account.id, balanceMinor)
  if (holdings !== undefined && !account.connectionId) await setManualHoldings(account, holdings)
  return (await accountSummary(who, account.id))!
})
