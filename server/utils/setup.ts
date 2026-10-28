import { and, count, eq, isNull, or } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import type { SetupStatus } from "#shared/setup"
import { budget, financeSetup, financialAccount, goal, member, transaction, transactionReview, user } from "../databases/config"
import { visibleAccounts, visibleTransactions, type Scope } from "./access"
import { monthOf, todayIso } from "./dates"
import type { Member } from "./identity"

export async function setupStatus(who: Member, scope: Scope): Promise<SetupStatus> {
  const month = monthOf(todayIso())
  const [[state], [accounts], [transactions], [unreviewed], [assigned], budgets, goals, people] = await Promise.all([
    db.select().from(financeSetup).where(and(eq(financeSetup.householdId, who.householdId), eq(financeSetup.userId, who.userId))),
    db.select({ count: count() }).from(financialAccount).where(and(visibleAccounts(who, scope), eq(financialAccount.archived, false))),
    db.select({ count: count() }).from(transaction).innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId)).where(visibleTransactions(who, scope)),
    db.select({ count: count() }).from(transaction).innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId)).leftJoin(transactionReview, eq(transactionReview.transactionId, transaction.id)).where(and(visibleTransactions(who, scope), eq(transaction.excluded, false), isNull(transactionReview.reviewedAt))),
    db.select({ count: count() }).from(transaction).innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId)).innerJoin(transactionReview, eq(transactionReview.transactionId, transaction.id)).where(and(visibleTransactions(who, scope), eq(transaction.excluded, false), eq(transactionReview.assignedTo, who.userId), isNull(transactionReview.reviewedAt))),
    db.select({ id: budget.id }).from(budget).where(and(eq(budget.householdId, who.householdId), or(isNull(budget.ownerId), eq(budget.ownerId, who.userId)))),
    db.select({ id: goal.id }).from(goal).where(and(eq(goal.householdId, who.householdId), or(isNull(goal.ownerId), eq(goal.ownerId, who.userId)))),
    db.select({ userId: user.id, name: user.name, checkinMonth: financeSetup.checkinMonth }).from(member).innerJoin(user, eq(user.id, member.userId)).leftJoin(financeSetup, and(eq(financeSetup.userId, member.userId), eq(financeSetup.householdId, member.organizationId))).where(eq(member.organizationId, who.householdId)),
  ])
  return {
    dismissed: state?.dismissed ?? false, sharingReviewed: state?.sharingReviewed ?? false,
    recurringReviewed: state?.recurringReviewed ?? false, forecastReviewed: state?.forecastReviewed ?? false,
    accountCount: accounts?.count ?? 0, transactionCount: transactions?.count ?? 0,
    needsReview: unreviewed?.count ?? 0, assignedToMe: assigned?.count ?? 0,
    planCount: budgets.length + goals.length, month,
    checkins: people.map(person => ({ userId: person.userId, name: person.name, complete: person.checkinMonth === month })),
  }
}
export async function updateSetup(who: Member, input: { dismissed?: boolean; sharingReviewed?: boolean; recurringReviewed?: boolean; forecastReviewed?: boolean; checkin?: boolean }) {
  const { checkin, ...fields } = input
  const values = { ...fields, ...(checkin === undefined ? {} : { checkinMonth: checkin ? monthOf(todayIso()) : null }) }
  if (!Object.keys(values).length) return
  await db.insert(financeSetup).values({ householdId: who.householdId, userId: who.userId, ...values }).onConflictDoUpdate({ target: [financeSetup.householdId, financeSetup.userId], set: values })
}
