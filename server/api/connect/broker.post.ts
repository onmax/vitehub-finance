import { and, eq } from "drizzle-orm"
import { defineHandler } from "h3"
import * as v from "valibot"
import { db } from "vite-hub/database/drizzle"
import { dispatchSync } from "#dispatch"
import type { ConnectionSummary } from "#shared/api"
import { connection } from "../../databases/config"
import { ibkrProvider } from "../../providers/ibkr"
import { BROKER_PROVIDERS } from "../../providers/index"
import { connectionSummary, fail, providerHttpError, readValid, rememberOrigin } from "../../utils/connections"
import { seal } from "../../utils/crypto"
import { requireMember } from "../../utils/identity"
import { refuseDemoPerson } from "../../demo/mode"

const Body = v.object({
  provider: v.picklist(BROKER_PROVIDERS),
  token: v.pipe(v.string(), v.trim(), v.minLength(1, "Paste the Flex token."), v.maxLength(200)),
  queryId: v.pipe(v.string(), v.trim(), v.regex(/^\d{1,20}$/, "The Query ID is a number.")),
  name: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
})

/**
 * Connects Interactive Brokers with a Flex token and an Activity Flex Query. The query runs once before anything is
 * saved, so a wrong token or a query without positions answers 401 with IBKR's reason; then it's sealed and synced.
 * Flex tokens expire, so connecting a query that's already connected gives that connection the new token, keeping its
 * accounts and history.
 */
export default defineHandler(async (event): Promise<ConnectionSummary> => {
  refuseDemoPerson(await requireMember(event))
  const who = await requireMember(event)
  const body = await readValid(event, Body)
  const credentials = { token: body.token, queryId: body.queryId }
  // The query decides what's read; a new token for the same query is the same connection.
  const externalId = `query:${body.queryId}`
  const [existing] = await db
    .select({ id: connection.id })
    .from(connection)
    .where(
      and(
        eq(connection.householdId, who.householdId),
        eq(connection.ownerId, who.userId),
        eq(connection.provider, body.provider),
        eq(connection.externalId, externalId),
      ),
    )
    .limit(1)
  const result = await ibkrProvider(credentials).catch((error) => {
    throw providerHttpError(error)
  })
  if (!result.accounts.length) throw fail(400, "The Flex Query has no accounts in it. Check its Accounts setting.")
  if (existing) {
    await db
      .update(connection)
      .set({ credentials: await seal(credentials), status: "active", lastError: null, lastErrorCode: null })
      .where(eq(connection.id, existing.id))
    await dispatchSync(existing.id, "link").catch((error) => console.error("[finance] Broker sync after a new token failed", error))
    return connectionSummary(who, existing.id)
  }
  const id = crypto.randomUUID()
  await db.insert(connection).values({
    id,
    householdId: who.householdId,
    ownerId: who.userId,
    provider: body.provider,
    name: body.name || "Interactive Brokers",
    institution: "Interactive Brokers",
    status: "active",
    credentials: await seal(credentials),
    externalId,
  })
  await rememberOrigin(event)
  // The sync records its own failures; the connection exists either way.
  await dispatchSync(id, "link").catch((error) => console.error("[finance] First broker sync failed", error))
  return connectionSummary(who, id)
})
