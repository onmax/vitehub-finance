import { and, desc, eq, gte } from "drizzle-orm"
import { defineHandler, getRouterParam } from "h3"
import { db, useLeases } from "vite-hub/database"
import { requireRateLimit } from "vite-hub/rate-limit"
import { dispatchSync } from "#dispatch"
import { syncRun } from "../../../databases/default"
import { errorMessage, fail, requireOwnConnection } from "../../../utils/connections"
import { requireMember } from "../../../utils/identity"
import { errorCode, TOO_MANY_TRIES } from "../../../utils/error-codes"
import { syncLeaseKey } from "../../../utils/sync"
import { refuseDemoPerson } from "../../../demo/mode"

// Banks allow about four unattended fetches a day under PSD2; the daily schedule uses one.
const BANK_INTERVAL = 6 * 60 * 60 * 1000

/**
 * Syncs now. On Node it waits for the sync and reports its failure; on Cloudflare it queues one. A connection syncs
 * by hand at most three times a minute and once at a time: the sync holds the connection's lease until it ends.
 */
export default defineHandler(async (event) => {
  const who = await requireMember(event)
  refuseDemoPerson(who)
  const row = await requireOwnConnection(who, getRouterParam(event, "id"))
  if (row.status === "pending") throw fail(409, "Finish connecting this bank first.")
  if (row.status === "revoked") throw fail(409, "This connection was removed.")
  if (row.provider === "enable_banking" && row.lastSyncedAt && Date.now() - row.lastSyncedAt.getTime() < BANK_INTERVAL) {
    const next = new Date(row.lastSyncedAt.getTime() + BANK_INTERVAL)
    throw fail(
      429,
      `Try again after ${next.toISOString().slice(11, 16)} UTC. Banks allow only a few syncs a day.`,
      "syncAfter", { time: next.toISOString().slice(11, 16) },
    )
  }
  await requireRateLimit(event, "manual-sync", { limit: 3, window: "1m", key: row.id, message: TOO_MANY_TRIES, code: errorCode(TOO_MANY_TRIES) })
  const [leaseError, running] = await useLeases().get(syncLeaseKey(row.id))
  if (leaseError) throw leaseError
  if (running) throw fail(409, "This connection is already syncing. Wait for it to finish.")
  const started = new Date(Date.now() - 1000)
  try {
    await dispatchSync(row.id, "manual")
  } catch (error) {
    throw fail(502, errorMessage(error))
  }
  // Inline syncs record expected failures (an expired consent, a revoked key) instead of throwing.
  const [run] = await db
    .select({ status: syncRun.status, error: syncRun.error, errorCode: syncRun.errorCode })
    .from(syncRun)
    .where(and(eq(syncRun.connectionId, row.id), gte(syncRun.startedAt, started)))
    .orderBy(desc(syncRun.startedAt))
    .limit(1)
  if (run?.status === "failed") throw fail(502, run.error ?? "Sync failed. Try again later.", run.errorCode ?? "providerUnavailable")
  return { ok: true }
})
