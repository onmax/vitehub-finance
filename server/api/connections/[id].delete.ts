import { eq } from "drizzle-orm"
import { defineHandler, getRouterParam } from "h3"
import { db } from "vite-hub/database/drizzle"
import { connection, financialAccount } from "../../databases/config"
import { deleteSession, type EnableBankingCredentials } from "../../providers/enable-banking"
import { bankConfig, requireOwnConnection } from "../../utils/connections"
import { unseal } from "../../utils/crypto"
import { requireMember } from "../../utils/identity"
import { refuseDemoPerson } from "../../demo/mode"
import { eraseAccounts } from "../../utils/finance-lifecycle"

/**
 * Disconnects. `keepAccounts=1` keeps the accounts and their history as manual accounts; otherwise they go too. A bank
 * session is revoked at Enable Banking when possible.
 */
export default defineHandler(async (event) => {
  const who = await requireMember(event)
  refuseDemoPerson(who)
  const row = await requireOwnConnection(who, getRouterParam(event, "id"))
  if (row.provider === "enable_banking") {
    const config = bankConfig()
    const credentials = await unseal<EnableBankingCredentials>(row.credentials).catch(() => null)
    if (config && credentials?.sessionId) await deleteSession(config, credentials.sessionId)
  }
  if (event.url.searchParams.get("keepAccounts") === "1")
    await db.update(financialAccount).set({ connectionId: null, externalId: null, paymentBalance: null }).where(eq(financialAccount.connectionId, row.id))
  else {
    const accounts = await db.select({ id: financialAccount.id }).from(financialAccount).where(eq(financialAccount.connectionId, row.id))
    await eraseAccounts(accounts.map(account => account.id))
  }
  await db.delete(connection).where(eq(connection.id, row.id))
  return { ok: true }
})
