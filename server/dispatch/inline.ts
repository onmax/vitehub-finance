import { syncConnection, type SyncTrigger } from "../utils/sync"

/** Node and `nuxt dev`: no Queue, so a sync runs right here. The daily Schedule awaits each one in turn. */
export async function dispatchSync(connectionId: string, trigger: SyncTrigger) {
  await syncConnection(connectionId, trigger)
}
