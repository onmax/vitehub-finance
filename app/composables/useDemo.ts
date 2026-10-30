import { isDemoEmail } from "#shared/demo"

/** What a locked control says to the demo's people. The server refuses the same actions with a 403. */
export const demoLocked = () => translate("notAvailableInTheDemo")

/**
 * Whether this is the demo build (`FINANCE_DEMO=1`, finance.vitehub.dev): a made-up household anyone can open, with no
 * sign-up, so it never holds anyone's real data.
 */
export const useDemoBuild = () => Boolean(useRuntimeConfig().public.demo)

/**
 * Whether the signed-in person is one of the demo's, Lucía or Pablo. Every visitor shares them, so they can't change
 * anything (`<DemoLock>`, and the server's `refuseDemoPerson`).
 */
export function useDemoPerson() {
  const { user } = useAuthSession()
  const demo = useDemoBuild()
  return computed(() => demo && isDemoEmail(user.value?.email))
}

/** Signs a visitor in as one of the demo's people (the server seeds the household when it's missing). */
export async function enterDemo(as: "lucia" | "pablo" = "lucia") {
  await $fetch("/api/demo/session", { method: "POST", body: { as } })
  await useAuthSession().refresh()
}
