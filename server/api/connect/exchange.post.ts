import { defineHandler } from "h3"
import * as v from "valibot"
import { db } from "vite-hub/database/drizzle"
import { dispatchSync } from "#dispatch"
import type { ConnectionSummary } from "#shared/api"
import { connection } from "../../databases/config"
import { EXCHANGES } from "@vitehub-finance/crypto"
import { cryptoProvider } from "../../providers/crypto"
import { EXCHANGE_PROVIDERS } from "../../providers/index"
import {
  assertNotLinked,
  connectionSummary,
  providerHttpError,
  readValid,
  rememberOrigin,
} from "../../utils/connections"
import { seal } from "../../utils/crypto"
import { requireMember } from "../../utils/identity"
import { refuseInDemo } from "../../demo/mode"

const Body = v.object({
  provider: v.picklist(EXCHANGE_PROVIDERS),
  key: v.pipe(v.string(), v.trim(), v.minLength(1, "Paste the API key."), v.maxLength(500)),
  secret: v.pipe(v.string(), v.trim(), v.minLength(1, "Paste the API secret."), v.maxLength(5000)),
  name: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
})

/**
 * Connects an exchange with a read-only key. The key is tried once before anything is saved, so a wrong one answers 401
 * with the exchange's own reason; then it's sealed and synced.
 */
export default defineHandler(async (event): Promise<ConnectionSummary> => {
  refuseInDemo()
  const who = await requireMember(event)
  const body = await readValid(event, Body)
  const credentials = { key: body.key, secret: body.secret }
  // A label to recognize the key by, never enough to use it.
  const externalId = `${body.key.slice(0, 8)}…`
  await assertNotLinked(who, body.provider, externalId)
  await cryptoProvider(body.provider)(credentials).catch((error) => {
    throw providerHttpError(error)
  })
  const id = crypto.randomUUID()
  await db.insert(connection).values({
    id,
    householdId: who.householdId,
    ownerId: who.userId,
    provider: body.provider,
    name: body.name || EXCHANGES[body.provider].name,
    institution: EXCHANGES[body.provider].name,
    status: "active",
    credentials: await seal(credentials),
    externalId,
  })
  await rememberOrigin(event)
  // The sync records its own failures; the connection exists either way.
  await dispatchSync(id, "link").catch((error) => console.error("[finance] First exchange sync failed", error))
  return connectionSummary(who, id)
})
