import { and, eq } from "drizzle-orm"
import { useLogger } from "evlog/nitro/v3"
import { defineHandler } from "h3"
import * as v from "valibot"
import { db } from "vite-hub/database/drizzle"
import { stripe } from "@vitehub-finance/payments"
import { dispatchSync } from "#dispatch"
import type { ConnectionSummary } from "#shared/api"
import { connection } from "../../databases/config"
import { refuseDemoPerson } from "../../demo/mode"
import { mapped, USER_AGENT } from "../../providers/types"
import { connectionSummary, providerHttpError, readValid, rememberOrigin } from "../../utils/connections"
import { seal } from "../../utils/crypto"
import { requireMember } from "../../utils/identity"

const Body = v.object({
  key: v.pipe(v.string(), v.trim(), v.maxLength(500), v.regex(/^rk_live_[a-zA-Z0-9]+$/, "Use a live restricted Stripe key starting with rk_live_.")),
  name: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
})

export default defineHandler(async (event): Promise<ConnectionSummary> => {
  const who = await requireMember(event)
  refuseDemoPerson(who)
  const body = await readValid(event, Body)
  const log = useLogger(event)
  log.set({ action: "connect-stripe", connect: { provider: "stripe" } })
  const verified = await mapped(() => stripe({ key: body.key }, { userAgent: USER_AGENT }).verify()).catch((error) => {
    throw providerHttpError(error)
  })
  const [existing] = await db.select({ id: connection.id }).from(connection).where(and(
    eq(connection.householdId, who.householdId),
    eq(connection.ownerId, who.userId),
    eq(connection.provider, "stripe"),
    eq(connection.externalId, verified.accountId),
  )).limit(1)
  const id = existing?.id ?? crypto.randomUUID()
  const credentials = await seal({ key: body.key, accountId: verified.accountId })
  if (existing) {
    await db.update(connection).set({ credentials, status: "active", lastError: null, lastErrorCode: null }).where(eq(connection.id, id))
  } else {
    await db.insert(connection).values({
      id,
      householdId: who.householdId,
      ownerId: who.userId,
      provider: "stripe",
      name: body.name || "Stripe",
      institution: "Stripe",
      status: "active",
      credentials,
      externalId: verified.accountId,
    })
  }
  log.set({ connect: { connectionId: id } })
  await rememberOrigin(event)
  await dispatchSync(id, "link").catch(() => log.warn("First Stripe sync failed", { connect: { connectionId: id } }))
  return connectionSummary(who, id)
})
