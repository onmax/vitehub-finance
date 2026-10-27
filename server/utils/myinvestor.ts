import { eq } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import { connection } from "../databases/config"
import type { MyInvestorCredentials } from "../providers/myinvestor"
import { fail } from "./connections"
import { seal, unseal } from "./crypto"
import type { Member } from "./identity"
import { syncConnection } from "./sync"

/**
 * New units for the funds of a MyInvestor connection, from its account's settings: the person bought or sold, and
 * MyInvestor can't say so. Only whoever connected it may, since the list is part of its sealed credentials. A fund at 0
 * units leaves the list, and the account syncs at once at Morningstar's prices.
 */
export async function setMyInvestorUnits(who: Member, connectionId: string, holdings: Array<{ symbol: string; quantity: number }>) {
  const [row] = await db.select().from(connection).where(eq(connection.id, connectionId)).limit(1)
  if (!row || row.provider !== "myinvestor")
    throw fail(400, "You can't edit a connected account's balance. It updates when the connection syncs.")
  if (row.ownerId !== who.userId) throw fail(403, "Only the person who connected it can do that.")
  const credentials = row.credentials ? await unseal<MyInvestorCredentials>(row.credentials).catch(() => null) : null
  if (!credentials) throw fail(409, "Couldn't read this connection's saved credentials. Reconnect it. If you run this server, check whether FINANCE_ENCRYPTION_KEY changed.")
  const units = new Map(holdings.map((entry) => [entry.symbol.toUpperCase(), entry.quantity]))
  const funds = credentials.funds
    .map((fund) => ({ ...fund, units: units.get((fund.isin ?? fund.id).toUpperCase()) ?? fund.units }))
    .filter((fund) => fund.units > 0)
  if (!funds.length) throw fail(400, "Add at least one fund.")
  await db.update(connection).set({ credentials: await seal({ funds } satisfies MyInvestorCredentials) }).where(eq(connection.id, row.id))
  await syncConnection(row.id, "manual")
}
