import { eq } from "drizzle-orm"
import { defineHandler, redirect } from "h3"
import { db } from "vite-hub/database/drizzle"
import { kv } from "vite-hub/kv"
import { dispatchSync } from "#dispatch"
import { connection } from "../../databases/config"
import { createSession, deleteSession, type EnableBankingCredentials } from "../../providers/enable-banking"
import {
  bankConfig,
  errorMessage,
  rememberOrigin,
  STATE_TTL,
  type ConnectionRow,
  type LinkState,
} from "../../utils/connections"
import { seal, unseal } from "../../utils/crypto"
import { identify } from "../../utils/identity"
import { matchReconnectedAccounts } from "../../utils/sync"

const toConnect = (query: Record<string, string>) => redirect(`/connect?${new URLSearchParams(query)}`, 302)

/**
 * Where the bank sends people back after the consent. Trades the code for a session, stores it sealed, runs the first
 * sync, and lands on /connect with `linked` or a short `error`.
 */
export default defineHandler(async (event) => {
  const params = event.url.searchParams
  const state = params.get("state") ?? ""
  let row: ConnectionRow | undefined

  const failed = async (message: string) => {
    // A new link that failed is an error; an existing connection keeps its status and shows why.
    if (row)
      await db
        .update(connection)
        .set({ ...(row.status === "pending" ? { status: "error" as const } : {}), lastError: message })
        .where(eq(connection.id, row.id))
    return toConnect({ error: message.slice(0, 200) })
  }

  try {
    if (!/^[a-f0-9]{32}$/.test(state)) return failed("The bank sent no valid state. Start connecting again.")
    const key = `eb-state:${state}`
    const [, entry] = await kv.get<LinkState>(key)
    // One use only: a replayed redirect finds nothing.
    await kv.del(key)
    if (!entry || Date.now() - entry.at > STATE_TTL) return failed("This bank link expired. Start connecting again.")

    ;[row] = await db.select().from(connection).where(eq(connection.id, entry.connectionId)).limit(1)
    if (!row || row.status === "revoked") {
      row = undefined
      return failed("This connection no longer exists.")
    }
    // The consent must land with whoever started it, never in someone else's household.
    const who = await identify(event)
    if (!who || who.userId !== entry.userId || who.userId !== row.ownerId) {
      const message = "Sign in as the person who started connecting this bank, then try again."
      row = undefined
      return failed(message)
    }

    const bankError = params.get("error")
    if (bankError) return failed(params.get("error_description") || `The bank didn't give access (${bankError}).`)
    const code = params.get("code")
    if (!code) return failed("The bank sent no authorization code.")
    const config = bankConfig()
    if (!config) return failed("Bank connections aren't set up on this Joxi.")

    const session = await createSession(config, code)
    if (!session.accounts.length) return failed("The bank shared no accounts. Try again and select at least one.")
    const previous = await unseal<EnableBankingCredentials>(row.credentials).catch(() => null)
    await matchReconnectedAccounts(row.id, session.accounts)
    await db
      .update(connection)
      .set({
        credentials: await seal(session.credentials),
        externalId: session.credentials.sessionId,
        consentExpiresAt: session.consentExpiresAt,
        status: "active",
        lastError: null,
        remindedAt: null,
      })
      .where(eq(connection.id, row.id))
    row = { ...row, status: "active" }
    if (previous?.sessionId && previous.sessionId !== session.credentials.sessionId)
      await deleteSession(config, previous.sessionId)
    await rememberOrigin(event)

    try {
      await dispatchSync(row.id, "link")
    } catch (error) {
      return toConnect({ error: `Linked, but the first sync failed: ${errorMessage(error)}`.slice(0, 200) })
    }
    // Inline syncs record expected failures instead of throwing; read how it went.
    const [after] = await db
      .select({ status: connection.status, lastError: connection.lastError })
      .from(connection)
      .where(eq(connection.id, row.id))
      .limit(1)
    if (after && after.status !== "active")
      return toConnect({ error: `Linked, but the first sync failed: ${after.lastError ?? after.status}`.slice(0, 200) })
    return toConnect({ linked: row.id })
  } catch (error) {
    console.error("[joxi] Bank callback failed", error)
    return failed(errorMessage(error))
  }
})
