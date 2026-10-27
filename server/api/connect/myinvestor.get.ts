import { and, eq } from "drizzle-orm"
import { defineHandler } from "h3"
import { db } from "vite-hub/database/drizzle"
import type { FundMatch } from "#shared/api"
import { connection } from "../../databases/config"
import type { MyInvestorCredentials } from "../../providers/myinvestor"
import { unseal } from "../../utils/crypto"
import { requireMember } from "../../utils/identity"

/**
 * The funds and units of the caller's own MyInvestor connection, so its connect dialog opens on them: connecting again
 * replaces the list. Empty when they have none. Only the owner's: they're its credentials.
 */
export default defineHandler(async (event): Promise<Array<FundMatch & { units: number }>> => {
  const who = await requireMember(event)
  const [row] = await db
    .select({ credentials: connection.credentials })
    .from(connection)
    .where(and(eq(connection.householdId, who.householdId), eq(connection.ownerId, who.userId), eq(connection.provider, "myinvestor")))
    .limit(1)
  const credentials = row?.credentials ? await unseal<MyInvestorCredentials>(row.credentials).catch(() => null) : null
  return (credentials?.funds ?? []).map(({ id, isin, name, currency, units }) => ({ id, isin, name, currency, category: null, units }))
})
