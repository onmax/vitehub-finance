import { inArray } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import {
  account as authAccount,
  apikey,
  budget,
  category,
  connection,
  financeSetup,
  financialAccount,
  forecastPlan,
  goal,
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
  transactionReview,
  twoFactor,
  user as users,
} from "../databases/config"
import { splitHouseholds } from "./erase-core"
import { chunks, eraseAccounts, eraseBudgets, eraseTransactionReviews } from "./finance-lifecycle"

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

/** Every row a household owns, then the household. SQLite may run without foreign keys, so children go first. */
async function eraseHouseholds(households: string[]) {
  if (!households.length) return
  const accountIds = (
    await db.select({ id: financialAccount.id }).from(financialAccount).where(inArray(financialAccount.householdId, households))
  ).map((row) => row.id)
  const connectionIds = (await db.select({ id: connection.id }).from(connection).where(inArray(connection.householdId, households))).map(
    (row) => row.id,
  )
  await eraseTransactionReviews(inArray(transaction.householdId, households))
  await eraseAccounts(accountIds)
  await db.delete(transaction).where(inArray(transaction.householdId, households))
  await db.delete(recurring).where(inArray(recurring.householdId, households))
  await db.delete(goal).where(inArray(goal.householdId, households))
  const budgets = await db.select({ id: budget.id }).from(budget).where(inArray(budget.householdId, households))
  await eraseBudgets(budgets.map(row => row.id))
  await db.delete(forecastPlan).where(inArray(forecastPlan.householdId, households))
  await db.delete(financeSetup).where(inArray(financeSetup.householdId, households))
  for (const ids of chunks(connectionIds)) await db.delete(syncRun).where(inArray(syncRun.connectionId, ids))
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
  await db.delete(forecastPlan).where(inArray(forecastPlan.ownerId, userIds))
  await db.delete(financeSetup).where(inArray(financeSetup.userId, userIds))
  await db.update(transactionReview).set({ reviewedBy: null, revision: crypto.randomUUID() }).where(inArray(transactionReview.reviewedBy, userIds))
  await db.update(transactionReview).set({ assignedTo: null, revision: crypto.randomUUID() }).where(inArray(transactionReview.assignedTo, userIds))
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
