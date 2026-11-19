import { sendQueue } from "vite-hub/queue"
import type { SyncTrigger } from "../utils/sync"

/** Cloudflare: one Queue message per connection, so a slow bank never holds up the others and failures retry. */
export async function dispatchSync(connectionId: string, trigger: SyncTrigger) {
  const [error] = await sendQueue("sync", { connectionId, trigger })
  if (error) throw error
}
