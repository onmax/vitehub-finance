import { eq } from "drizzle-orm"
import { defineHandler, HTTPError } from "h3"
import * as v from "valibot"
import { db } from "vite-hub/database/drizzle"
import type { AccountSummary } from "#shared/api"
import { canEdit, canManage } from "#shared/access"
import { financialAccount } from "../../databases/config"
import { requireAccount } from "../../utils/access"
import { accountSummary } from "../../utils/accounts"
import { requireMember } from "../../utils/identity"
import { Kind, Minor, Name, param, Permission, readInput, Visibility } from "../../utils/input"
import { recordSnapshot } from "../../utils/snapshots"

const Body = v.object({
  name: v.optional(Name),
  kind: v.optional(Kind),
  visibility: v.optional(Visibility),
  householdPermission: v.optional(Permission),
  includeInNetWorth: v.optional(v.boolean()),
  archived: v.optional(v.boolean()),
  balanceMinor: v.optional(Minor),
})

/**
 * Who sees an account and what others may do with it is the owner's call (`canManage`); renaming, archiving, and the
 * rest need `canEdit`. A synced account's balance comes from its provider, so only manual ones take `balanceMinor`.
 */
export default defineHandler(async (event): Promise<AccountSummary> => {
  const who = await requireMember(event)
  const account = await requireAccount(who, param(event))
  const body = await readInput(event, Body)
  if ((body.visibility !== undefined || body.householdPermission !== undefined) && !canManage(account, who.userId))
    throw new HTTPError({ status: 403, statusText: "Only the account's owner changes who sees it." })
  const { visibility, householdPermission, balanceMinor, ...rest } = body
  if ((Object.keys(rest).length || balanceMinor !== undefined) && !canEdit(account, who.userId))
    throw new HTTPError({ status: 403, statusText: "This account is shared view-only." })
  if (balanceMinor !== undefined && account.connectionId)
    throw new HTTPError({ status: 400, statusText: "A connected account's balance comes from its provider." })
  const set = {
    ...rest,
    ...(visibility ? { visibility } : {}),
    ...(householdPermission ? { householdPermission } : {}),
    ...(balanceMinor !== undefined ? { balanceMinor, balanceUpdatedAt: new Date() } : {}),
  }
  if (Object.keys(set).length) await db.update(financialAccount).set(set).where(eq(financialAccount.id, account.id))
  if (balanceMinor !== undefined) await recordSnapshot(account.id, balanceMinor)
  return (await accountSummary(who, account.id))!
})
