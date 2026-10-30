import { and, desc, eq, gte } from "drizzle-orm"
import { defineHandler, getRouterParam } from "h3"
import { db } from "vite-hub/database/drizzle"
import { checkRateLimit } from "vite-hub/rate-limit"
import { dispatchSync } from "#dispatch"
import { syncRun } from "../../../databases/config"
import { errorMessage, fail, requireOwnConnection } from "../../../utils/connections"
import { requireMember } from "../../../utils/identity"
import { refuseOverLimit } from "../../../utils/rate-limit"
import { releaseSync, reserveSync } from "../../../utils/sync"
import { refuseDemoPerson } from "../../../demo/mode"

// Banks allow about four unattended fetches a day under PSD2; the daily schedule uses one.
const BANK_INTERVAL = 6 * 60 * 60 * 1000

/**
 * Syncs now. On Node it waits for the sync and reports its failure; on Cloudflare it queues one. A connection syncs
 * by hand at most three times a minute and once at a time: the reservation holds it until that sync ends.
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
  refuseOverLimit(await checkRateLimit(event, "manual-sync", { limit: 3, window: "1m", key: row.id }))
  if (!(await reserveSync(row.id))) throw fail(409, "This connection is already syncing. Wait for it to finish.")
  const started = new Date(Date.now() - 1000)
  try {
    await dispatchSync(row.id, "manual")
  } catch (error) {
    // Queued or not, the manual sync releases the reservation when it ends; one that never started can't.
    await releaseSync(row.id)
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
