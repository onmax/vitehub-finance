import { inArray } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import {
  account as authAccount,
  apikey,
  balanceSnapshot,
  budget,
  category,
  connection,
  financialAccount,
  goal,
  holding,
  householdSettings,
  invitation,
  member,
  oauthAccessToken,
  oauthConsent,
  oauthRefreshToken,
  organization,
  passkey,
  recurring,
  rule,
  session,
  syncRun,
  transaction,
  twoFactor,
  user as users,
} from "../databases/config"
import { splitHouseholds } from "./erase-core"

/**
 * Erasing people and their money: the demo's nightly reset (server/demo/seed.ts) and someone deleting their own account
 * (server/auth.ts `deleteUser`). Both go through `splitHouseholds` (erase-core.ts), so a household with anyone else in it
 * is never touched.
 */

/** The households `userIds` belong to, split into theirs alone and the ones they share with someone else. */
export async function householdsOf(userIds: string[]) {
  const memberships = await db.select({ organizationId: member.organizationId, userId: member.userId }).from(member)
  return splitHouseholds(memberships, new Set(userIds))
}

/** Runs `remove` over `ids` in chunks that stay under D1's 100 bound parameters a statement. */
async function inChunks(ids: string[], remove: (chunk: string[]) => Promise<unknown>) {
  for (let index = 0; index < ids.length; index += 80) await remove(ids.slice(index, index + 80))
}

/** Every row a household owns, then the household. SQLite may run without foreign keys, so children go first. */
async function eraseHouseholds(households: string[]) {
  if (!households.length) return
  const accountIds = (
    await db.select({ id: financialAccount.id }).from(financialAccount).where(inArray(financialAccount.householdId, households))
  ).map((row) => row.id)
  const connectionIds = (await db.select({ id: connection.id }).from(connection).where(inArray(connection.householdId, households))).map(
    (row) => row.id,
  )
  await db.delete(transaction).where(inArray(transaction.householdId, households))
  await db.delete(recurring).where(inArray(recurring.householdId, households))
  await inChunks(accountIds, async (ids) => {
    await db.delete(holding).where(inArray(holding.accountId, ids))
    await db.delete(balanceSnapshot).where(inArray(balanceSnapshot.accountId, ids))
  })
  await db.delete(goal).where(inArray(goal.householdId, households))
  await db.delete(budget).where(inArray(budget.householdId, households))
  await db.delete(financialAccount).where(inArray(financialAccount.householdId, households))
  await inChunks(connectionIds, (ids) => db.delete(syncRun).where(inArray(syncRun.connectionId, ids)))
  await db.delete(connection).where(inArray(connection.householdId, households))
  await db.delete(rule).where(inArray(rule.householdId, households))
  await db.delete(category).where(inArray(category.householdId, households))
  await db.delete(householdSettings).where(inArray(householdSettings.householdId, households))
  await db.delete(invitation).where(inArray(invitation.organizationId, households))
  await db.delete(member).where(inArray(member.organizationId, households))
  await db.delete(organization).where(inArray(organization.id, households))
}

/**
 * Erases `userIds`, the households only they belong to (with every account, transaction, and connection in them), and
 * whatever they made: API keys, passkeys, agents' tokens, two-factor. Households they share with anyone else stay as
 * they are; callers that must not leave someone half-removed check `householdsOf(...).shared` first.
 *
 * `keepLogin` leaves the user row, sessions, and sign-in methods for Better Auth's own `deleteUser` to remove.
 */
export async function erasePeople(userIds: string[], options: { keepLogin?: boolean } = {}) {
  if (!userIds.length) return
  const { alone } = await householdsOf(userIds)
  await eraseHouseholds(alone)
  await db.delete(member).where(inArray(member.userId, userIds))
  await db.delete(apikey).where(inArray(apikey.referenceId, userIds))
  await db.delete(oauthAccessToken).where(inArray(oauthAccessToken.userId, userIds))
  await db.delete(oauthRefreshToken).where(inArray(oauthRefreshToken.userId, userIds))
  await db.delete(oauthConsent).where(inArray(oauthConsent.userId, userIds))
  await db.delete(passkey).where(inArray(passkey.userId, userIds))
  await db.delete(twoFactor).where(inArray(twoFactor.userId, userIds))
  if (options.keepLogin) return
  await db.delete(session).where(inArray(session.userId, userIds))
  await db.delete(authAccount).where(inArray(authAccount.userId, userIds))
  await db.delete(users).where(inArray(users.id, userIds))
}
