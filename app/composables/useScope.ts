import { useStorage } from "@vueuse/core"
import type { Scope } from "#shared/api"

/**
 * Me or Household: which accounts every view counts. Remembered on this device. Every data request sends it as
 * `?scope=` and puts it in its key, so views refetch when it changes. With one member there is nothing to narrow.
 */
export function useScope() {
  const stored = useStorage<Scope>("joxi:scope", "household")
  const shared = useShared()
  return computed<Scope>({
    get: () => (shared.value ? stored.value : "household"),
    set: (value) => (stored.value = value),
  })
}
