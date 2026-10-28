import { useStorage } from "@vueuse/core"
import type { Scope } from "#shared/api"

/**
 * Personal (`me`) or Household: which accounts every view counts, switched in the sidebar's header and remembered on
 * this device. Personal by default: your own money first, the household's when you ask for it. Every data request sends
 * it as `?scope=` and puts it in its key, so views refetch when it changes.
 */
export function useScope() {
  return useStorage<Scope>("finance:view", "me")
}
