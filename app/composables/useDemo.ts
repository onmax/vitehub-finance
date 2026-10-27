import { isDemoEmail } from "#shared/demo"

/** What a locked control says to the demo's people. The server refuses the same actions with a 403. */
export const demoLocked = () => translate("notAvailableInTheDemo")

/**
 * Whether this is a public instance (`FINANCE_DEMO=1`): anyone can sign up, and the login page also opens the demo
 * household.
 */
export const usePublicInstance = () => Boolean(useRuntimeConfig().public.demo)

/**
 * Whether the signed-in person is one of the demo's, Lucía or Pablo. Only they are locked (`<DemoLock>`, and the
 * server's `refuseDemoPerson`); everyone else on a public instance gets the whole product.
 */
export function useDemoPerson() {
  const { user } = useAuthSession()
  const instance = usePublicInstance()
  return computed(() => instance && isDemoEmail(user.value?.email))
}
