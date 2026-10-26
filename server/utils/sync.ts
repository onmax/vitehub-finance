export type SyncTrigger = "schedule" | "manual" | "link"

/** Placeholder until the sync engine lands. */
export async function syncConnection(connectionId: string, trigger: SyncTrigger) {
  throw new Error(`Sync is not implemented yet (${connectionId}, ${trigger}).`)
}
