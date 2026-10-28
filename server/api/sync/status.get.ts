import { and, eq, gt, inArray } from "drizzle-orm"
import { defineHandler } from "h3"
import { db } from "vite-hub/database/drizzle"
import type { SyncStatus } from "#shared/api"
import { syncRun } from "../../databases/config"
import { scopeOf } from "../../utils/access"
import { listConnections } from "../../utils/connections"
import { requireMember } from "../../utils/identity"
import { needsAttention } from "../../utils/overview"

/** A run older than this that never finished died with its Worker; it isn't syncing any more. */
const STALE_MS = 15 * 60 * 1000

/**
 * The caller's syncing at a glance, for the sidebar: running syncs, connections that need someone, the last sync. In the
 * personal view (`?scope=me`), only their own connections.
 */
export default defineHandler(async (event): Promise<SyncStatus> => {
  const who = await requireMember(event)
  const scope = scopeOf(event)
  const [connections, attention] = await Promise.all([listConnections(who, { scope }), needsAttention(who, scope)])
  const ids = connections.map((row) => row.id)
  const running = ids.length
    ? await db
        .select({ connectionId: syncRun.connectionId, startedAt: syncRun.startedAt })
        .from(syncRun)
        .where(and(inArray(syncRun.connectionId, ids.slice(0, 90)), eq(syncRun.status, "running"), gt(syncRun.startedAt, new Date(Date.now() - STALE_MS))))
    : []
  const byId = new Map(connections.map((row) => [row.id, row]))
  const syncing = [...new Map(running.map((run) => [run.connectionId, run])).values()].map((run) => {
    const row = byId.get(run.connectionId)!
    return { id: row.id, name: row.name, provider: row.provider, startedAt: run.startedAt.toISOString() }
  })
  const lastSyncedAt = connections.map((row) => row.lastSyncedAt).filter((at): at is string => Boolean(at)).sort().at(-1) ?? null
  return { syncing, attention, lastSyncedAt, connections: connections.length }
})
