import type { SetupCheck } from "#shared/api"
import { setupSteps } from "#shared/setup-steps"

/**
 * Where the setup guide's steps stand (GET /api/setup/check), shared by its prompt and every step's status, so one
 * "Check again" updates them all. Only a signed-in person outside the demo can ask; for anyone else `available` is
 * false and nothing is fetched.
 */
export function useSetupCheck() {
  const { ready, loggedIn } = useAuthSession()
  const available = computed(() => ready.value && loggedIn.value && !useDemoBuild())
  const fetched = useScopedFetch<SetupCheck | null>("/api/setup/check", { key: "setup-check", unscoped: true, default: () => null, immediate: false })
  whenever(available, () => fetched.refresh(), { immediate: true })
  const steps = computed(() => (fetched.data.value ? setupSteps(fetched.data.value) : []))
  return { ...fetched, available, steps }
}
