import type { MeResponse } from "#shared/api"

/**
 * The signed-in person, their household, its members, and whether email works. Fetched once and shared; call
 * `refresh()` after changing the household or profile.
 */
export function useMe() {
  return useFetch<MeResponse>("/api/me", {
    key: "me",
    default: () => undefined,
    getCachedData: cachedUnlessRefreshed,
    transform: expectJson,
  })
}

/** Keeps a fetched value for the whole visit unless something calls `refresh()` or `refreshNuxtData(key)`. */
export function cachedUnlessRefreshed(key: string, nuxtApp: ReturnType<typeof useNuxtApp>, context: { cause: string }) {
  if (context.cause === "refresh:manual" || context.cause === "refresh:hook") return undefined
  return nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]
}

/** Whether the household has more than one person: owner labels and shared-account details only matter then. */
export function useShared() {
  const { data: me } = useMe()
  return computed(() => (me.value?.members.length ?? 1) > 1)
}
