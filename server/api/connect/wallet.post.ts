import { useLogger } from "evlog/nitro/v3"
import { defineHandler } from "h3"
import * as v from "valibot"
import { db } from "vite-hub/database/drizzle"
import { dispatchSync } from "#dispatch"
import type { ConnectionSummary } from "#shared/api"
import { connection } from "../../databases/config"
import { CHAINS, parseAddress } from "@vitehub-finance/crypto"
import { WALLET_PROVIDERS } from "../../providers/index"
import { assertNotLinked, connectionSummary, errorMessage, fail, readValid, rememberOrigin } from "../../utils/connections"
import { seal } from "../../utils/crypto"
import { requireMember } from "../../utils/identity"
import { refuseDemoPerson } from "../../demo/mode"

const Body = v.object({
  chain: v.picklist(WALLET_PROVIDERS),
  address: v.pipe(v.string(), v.trim(), v.minLength(1, "Paste the wallet address."), v.maxLength(200)),
  name: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
})

/** Watches a public wallet address: its native coin balance, priced like any holding. */
export default defineHandler(async (event): Promise<ConnectionSummary> => {
  refuseDemoPerson(await requireMember(event))
  const who = await requireMember(event)
  const body = await readValid(event, Body)
  const address = parseAddress(body.chain, body.address)
  if (!address) throw fail(400, `That isn't a valid ${CHAINS[body.chain].name} address.`, "invalidWallet", { chain: CHAINS[body.chain].name })
  await assertNotLinked(who, body.chain, address)
  const id = crypto.randomUUID()
  await db.insert(connection).values({
    id,
    householdId: who.householdId,
    ownerId: who.userId,
    provider: body.chain,
    name: body.name || `${CHAINS[body.chain].name} wallet`,
    institution: CHAINS[body.chain].name,
    status: "active",
    credentials: await seal({ address }),
    externalId: address,
  })
  // The chain, never the address: it's public, but it ties the household to its coins.
  const log = useLogger(event)
  log.set({ action: "connect-wallet", connect: { provider: body.chain, connectionId: id } })
  await rememberOrigin(event)
  await dispatchSync(id, "link").catch((error) => log.warn("First wallet sync failed", { connect: { syncError: errorMessage(error) } }))
  return connectionSummary(who, id)
})
