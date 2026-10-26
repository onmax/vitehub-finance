import { defineHandler } from "h3"
import type { SyncRun } from "#shared/api"
import { recentRuns, requireOwnConnection } from "../../../utils/connections"
import { requireMember } from "../../../utils/identity"

/** The last 20 syncs of a connection, newest first. Only its owner sees them. */
export default defineHandler(async (event): Promise<SyncRun[]> => {
  const who = await requireMember(event)
  const row = await requireOwnConnection(who, event.context.params?.id)
  return recentRuns(row.id)
})
