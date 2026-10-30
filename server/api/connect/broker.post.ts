import { and, eq } from "drizzle-orm"
import { defineHandler } from "h3"
import * as v from "valibot"
import { db } from "vite-hub/database/drizzle"
import { dispatchSync } from "#dispatch"
import type { ConnectionSummary } from "#shared/api"
import { connection } from "../../databases/config"
import { ISIN } from "@vitehub-finance/brokers"
import { ibkrProvider } from "../../providers/ibkr"
import { myinvestorProvider } from "../../providers/myinvestor"
import { connectionSummary, fail, providerHttpError, readValid, rememberOrigin } from "../../utils/connections"
import { seal } from "../../utils/crypto"
import { requireMember } from "../../utils/identity"
import { refuseDemoPerson } from "../../demo/mode"

const Ibkr = v.object({
  provider: v.literal("ibkr"),
  token: v.pipe(v.string(), v.trim(), v.minLength(1, "Paste the Flex token."), v.maxLength(200)),
  queryId: v.pipe(v.string(), v.trim(), v.regex(/^\d{1,20}$/, "The Query ID is a number.")),
  name: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
})

// A fund as the dialog found it through GET /api/connect/funds, with the units held.
const Fund = v.object({
  id: v.pipe(v.string(), v.trim(), v.regex(/^[A-Z0-9]{6,16}$/i)),
  isin: v.nullable(v.pipe(v.string(), v.trim(), v.toUpperCase(), v.regex(ISIN))),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  currency: v.pipe(v.string(), v.trim(), v.toUpperCase(), v.regex(/^[A-Z]{3}$/)),
  units: v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1e12)),
})

const MyInvestor = v.object({
  provider: v.literal("myinvestor"),
  funds: v.pipe(
    v.array(Fund),
    v.filterItems((fund) => fund.units > 0),
    v.minLength(1, "Add at least one fund."),
    v.maxLength(50),
    v.check((funds) => new Set(funds.map((fund) => fund.isin ?? fund.id)).size === funds.length, "A fund is in the list twice."),
  ),
})

const Body = v.variant("provider", [Ibkr, MyInvestor])

/** What each broker stores, what makes a connection the same one again, and how it's named. */
function plan(body: v.InferOutput<typeof Body>) {
  if (body.provider === "ibkr") {
    const credentials = { token: body.token, queryId: body.queryId }
    // The query decides what's read; a new token for the same query is the same connection.
    return { credentials, externalId: `query:${body.queryId}`, name: body.name || "Interactive Brokers", institution: "Interactive Brokers", read: () => ibkrProvider(credentials) }
  }
  const credentials = { funds: body.funds }
  // One per person: connecting again replaces what they hold.
  return { credentials, externalId: "funds", name: "MyInvestor", institution: "MyInvestor", read: () => myinvestorProvider(credentials) }
}

/**
 * Connects a broker. Interactive Brokers takes a Flex token and an Activity Flex Query; MyInvestor takes the funds held
 * and their units, priced at Morningstar's NAV. The broker is read once before anything is saved, so a wrong token or a
 * fund without a price answers with the reason; then it's sealed and synced. Connecting the same query again (a Flex
 * token expires) or MyInvestor again gives that connection the new credentials, keeping its accounts and history.
 */
export default defineHandler(async (event): Promise<ConnectionSummary> => {
  const who = await requireMember(event)
  refuseDemoPerson(who)
  const body = await readValid(event, Body)
  const { credentials, externalId, name, institution, read } = plan(body)
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
  const result = await read().catch((error) => {
    throw providerHttpError(error)
  })
  if (!result.accounts.length) throw fail(400, "The Flex Query has no accounts in it. Check its Accounts setting.")
  if (existing) {
    await db
      .update(connection)
      .set({ credentials: await seal(credentials), status: "active", lastError: null, lastErrorCode: null })
      .where(eq(connection.id, existing.id))
    await dispatchSync(existing.id, "link").catch((error) => console.error("[finance] Broker sync after new credentials failed", error))
    return connectionSummary(who, existing.id)
  }
  const id = crypto.randomUUID()
  await db.insert(connection).values({
    id,
    householdId: who.householdId,
    ownerId: who.userId,
    provider: body.provider,
    name,
    institution,
    status: "active",
    credentials: await seal(credentials),
    externalId,
  })
  await rememberOrigin(event)
  // The sync records its own failures; the connection exists either way.
  await dispatchSync(id, "link").catch((error) => console.error("[finance] First broker sync failed", error))
  return connectionSummary(who, id)
})
