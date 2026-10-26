import { and, desc, eq, gte } from "drizzle-orm"
import { defineHandler } from "h3"
import { db } from "vite-hub/database/drizzle"
import { dispatchSync } from "#dispatch"
import { syncRun } from "../../../databases/config"
import { errorMessage, fail, requireOwnConnection } from "../../../utils/connections"
import { requireMember } from "../../../utils/identity"
import { refuseInDemo } from "../../../demo/mode"

// Banks allow about four unattended fetches a day under PSD2; the daily schedule uses one.
const BANK_INTERVAL = 6 * 60 * 60 * 1000

/** Syncs now. On Node it waits for the sync and reports its failure; on Cloudflare it queues one. */
export default defineHandler(async (event) => {
  refuseInDemo()
  const who = await requireMember(event)
  const row = await requireOwnConnection(who, event.context.params?.id)
  if (row.status === "pending") throw fail(409, "Finish connecting this bank first.")
  if (row.status === "revoked") throw fail(409, "This connection was removed.")
  if (row.provider === "enable_banking" && row.lastSyncedAt && Date.now() - row.lastSyncedAt.getTime() < BANK_INTERVAL) {
    const next = new Date(row.lastSyncedAt.getTime() + BANK_INTERVAL)
    throw fail(
      429,
      `Banks allow only a few updates a day. ${row.name} synced at ${row.lastSyncedAt.toISOString().slice(11, 16)} UTC; try again after ${next.toISOString().slice(11, 16)} UTC.`,
    )
  }
  const started = new Date(Date.now() - 1000)
  try {
    await dispatchSync(row.id, "manual")
  } catch (error) {
    throw fail(502, errorMessage(error))
  }
  // Inline syncs record expected failures (an expired consent, a revoked key) instead of throwing.
  const [run] = await db
    .select({ status: syncRun.status, error: syncRun.error })
    .from(syncRun)
    .where(and(eq(syncRun.connectionId, row.id), gte(syncRun.startedAt, started)))
    .orderBy(desc(syncRun.startedAt))
    .limit(1)
  if (run?.status === "failed") throw fail(502, run.error ?? "The sync failed.")
  return { ok: true }
})
