import { defineQueue } from "vite-hub/queue"
import { syncConnection, type SyncTrigger } from "../utils/sync"

/** One connection's sync (Cloudflare builds only; elsewhere server/dispatch/inline.ts calls the sync directly). */
export default defineQueue<{ connectionId: string; trigger: SyncTrigger }>(
  async ({ payload }) => {
    await syncConnection(payload.connectionId, payload.trigger)
  },
  {
    concurrency: 3,
    // A bank that's down now is often up in a few minutes; the sync run records the failure either way.
    onError: () => ({ retry: { delaySeconds: 300 } }),
  },
)
