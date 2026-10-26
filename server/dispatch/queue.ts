import { runQueue } from "vite-hub/queue"
import type { SyncTrigger } from "../utils/sync"

/** Cloudflare: one Queue message per connection, so a slow bank never holds up the others and failures retry. */
export async function dispatchSync(connectionId: string, trigger: SyncTrigger) {
  await runQueue("sync", { connectionId, trigger })
}
