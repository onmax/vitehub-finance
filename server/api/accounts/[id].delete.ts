import { HTTPError } from "../../utils/http-error"
import { eq } from "drizzle-orm"
import { defineHandler } from "h3"
import { db } from "vite-hub/database/drizzle"
import { canManage } from "#shared/access"
import { balanceSnapshot, financialAccount, goal, holding, recurring, transaction } from "../../databases/config"
import { requireAccount } from "../../utils/access"
import { requireMember } from "../../utils/identity"
import { param } from "../../utils/input"
import { refuseDemoPerson } from "../../demo/mode"

/** The owner deletes an account with its history. Dependent rows go explicitly: SQLite may run without foreign keys. */
export default defineHandler(async (event) => {
  refuseDemoPerson(await requireMember(event))
  const who = await requireMember(event)
  const account = await requireAccount(who, param(event))
  if (!canManage(account, who.userId)) throw new HTTPError({ status: 403, statusText: "Only the account's owner can delete it." })
  await db.delete(transaction).where(eq(transaction.accountId, account.id))
  await db.delete(recurring).where(eq(recurring.accountId, account.id))
  await db.delete(holding).where(eq(holding.accountId, account.id))
  await db.delete(balanceSnapshot).where(eq(balanceSnapshot.accountId, account.id))
  await db.update(goal).set({ accountId: null }).where(eq(goal.accountId, account.id))
  await db.delete(financialAccount).where(eq(financialAccount.id, account.id))
  return { ok: true }
})
