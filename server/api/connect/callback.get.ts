import { errorCode } from "../../utils/error-codes"
import { eq } from "drizzle-orm"
import { useLogger } from "evlog/nitro/v3"
import { defineHandler, redirect } from "h3"
import { db } from "vite-hub/database/drizzle"
import { kv } from "vite-hub/kv"
import { dispatchSync } from "#dispatch"
import { connection } from "../../databases/config"
import { createSession, deleteSession, sessionDigest, type EnableBankingCredentials } from "../../providers/enable-banking"
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

const toConnect = (query: Record<string, string>) => redirect(`/connect/banks?${new URLSearchParams(query)}`, 302)

/**
 * Where the bank sends people back after the consent. Trades the code for a session, stores it sealed, runs the first
 * sync, and lands on /connect/banks with `linked` or a short `error`.
 */
export default defineHandler(async (event) => {
  const params = event.url.searchParams
  const state = params.get("state") ?? ""
  let row: ConnectionRow | undefined
  // The redirect always answers 302, so the wide event carries the outcome. Never the code or the state.
  const log = useLogger(event)
  log.set({ action: "bank-callback" })

  const failed = async (message: string) => {
    log.warn(message, { callback: { outcome: "failed", connectionId: row?.id } })
    // A new link that failed is an error; an existing connection keeps its status and shows why.
    if (row)
      await db
        .update(connection)
        .set({ ...(row.status === "pending" ? { status: "error" as const } : {}), lastError: message, lastErrorCode: errorCode(message) })
        .where(eq(connection.id, row.id))
    return toConnect({ error: message.slice(0, 200), error_code: errorCode(message) })
  }

  try {
    if (!/^[a-f0-9]{32}$/.test(state)) return failed("The bank sent back an incomplete link. Connect the bank again.")
    const key = `eb-state:${state}`
    const [, entry] = await kv.get<LinkState>(key)
    // One use only: a replayed redirect finds nothing.
    await kv.del(key)
    if (!entry || Date.now() - entry.at > STATE_TTL) return failed("This bank link expired. Connect the bank again.")

    ;[row] = await db.select().from(connection).where(eq(connection.id, entry.connectionId)).limit(1)
    if (!row || row.status === "revoked") {
      row = undefined
      return failed("This connection no longer exists. Connect the bank again.")
    }
    // The consent must land with whoever started it, never in someone else's household.
    const who = await identify(event)
    if (!who || who.userId !== entry.userId || who.userId !== row.ownerId) {
      const message = "Sign in as the person who started connecting this bank, then try again."
      row = undefined
      return failed(message)
    }

    const bankError = params.get("error")
    if (bankError) return failed(params.get("error_description") || `The bank didn't give access. Try again and approve it at your bank. Details: ${bankError}`)
    const code = params.get("code")
    if (!code) return failed("The bank didn't confirm access. Connect the bank again.")
    const config = bankConfig()
    if (!config) return failed("Bank connections aren't set up on this server.")

    const session = await createSession(config, code)
    if (!session.accounts.length) return failed("The bank shared no accounts. Try again and select at least one.")
    const previous = await unseal<EnableBankingCredentials>(row.credentials).catch(() => null)
    await matchReconnectedAccounts(row.id, session.accounts)
    await db
      .update(connection)
      .set({
        credentials: await seal(session.credentials),
        externalId: await sessionDigest(session.credentials.sessionId),
        consentExpiresAt: session.consentExpiresAt,
        status: "active",
        lastError: null,
        lastErrorCode: null,
        remindedAt: null,
      })
      .where(eq(connection.id, row.id))
    row = { ...row, status: "active" }
    log.set({ callback: { connectionId: row.id, accounts: session.accounts.length } })
    if (previous?.sessionId && previous.sessionId !== session.credentials.sessionId)
      await deleteSession(config, previous.sessionId)
    await rememberOrigin(event)

    try {
      await dispatchSync(row.id, "link")
    } catch (error) {
      log.warn("First sync failed", { callback: { outcome: "linked", syncError: errorMessage(error) } })
      return toConnect({ error: `Connected, but the first sync failed. ${errorMessage(error)}`.slice(0, 200), error_code: "providerPartial" })
    }
    // Inline syncs record expected failures instead of throwing; read how it went.
    const [after] = await db
      .select({ status: connection.status, lastError: connection.lastError })
      .from(connection)
      .where(eq(connection.id, row.id))
      .limit(1)
    log.set({ callback: { outcome: "linked", syncStatus: after?.status } })
    if (after && after.status !== "active")
      return toConnect({ error: `Connected, but the first sync failed. ${after.lastError ?? "Try again later."}`.slice(0, 200), error_code: "providerPartial" })
    return toConnect({ linked: row.id })
  } catch (error) {
    // An error, not the warning `failed` adds: something other than the bank or the person went wrong.
    log.error(error instanceof Error ? error : new Error(errorMessage(error)), { callback: { outcome: "error" } })
    return failed(errorMessage(error))
  }
})
