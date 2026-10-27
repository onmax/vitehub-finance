import type { MaybeRefOrGetter } from "vue"

type Query = Record<string, string | number | boolean | null | undefined>

export interface ScopedFetchOptions<T> {
  /** The cache key's stem; the scope and query complete it. */
  key: string
  query?: MaybeRefOrGetter<Query>
  default?: () => T
  /** Leave out `?scope=` (routes that don't take it). */
  unscoped?: boolean
  immediate?: boolean
  lazy?: boolean
}

/**
 * `useFetch` for a view's data: adds `?scope=`, drops empty query values, and keys the cache by both, so a scope or
 * filter change refetches and switching back is instant. Lazy by default: pages render their skeletons at once.
 */
export function useScopedFetch<T>(url: MaybeRefOrGetter<string>, options: ScopedFetchOptions<T>) {
  const scope = useScope()
  const query = computed(() => {
    const entries = Object.entries(toValue(options.query) ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== "")
    if (!options.unscoped) entries.unshift(["scope", scope.value])
    return Object.fromEntries(entries) as Record<string, string | number | boolean>
  })
  const key = computed(() => `${options.key}:${toValue(url)}:${new URLSearchParams(query.value as Record<string, string>).toString()}`)
  // A reactive key: Nuxt fetches again whenever the scope or a filter changes it.
  return useAsyncData(
    key,
    (_nuxtApp, { signal }) => request<T>(toValue(url), { query: query.value, signal }).then(expectJson),
    {
      default: options.default ?? ((): T => undefined as T),
      lazy: options.lazy ?? true,
      immediate: options.immediate,
      // The sidebar and a page can ask for the same key at once (the overview's `attention`): share one request.
      dedupe: "defer",
    },
  )
}

/** $fetch without Nitro's route typing, which can't resolve a URL that's only known at runtime. */
const request = $fetch as unknown as <R>(url: string, options?: { query?: Record<string, unknown>; signal?: AbortSignal }) => Promise<R>

/**
 * Fails a request that answered with the app's HTML instead of JSON: an /api route that doesn't exist (yet) falls
 * through to the SPA. Without this the page would treat a string as its data.
 */
export function expectJson<T>(value: T): T {
  if (typeof value === "string") throw new Error(translate('thisServerDoesnTHaveThisFeatureYetReloadThe'))
  return value
}

/** Refreshes every cached request whose key starts with one of `stems` ("accounts", "overview"…). */
export function refreshStems(...stems: string[]) {
  const nuxtApp = useNuxtApp()
  const keys = Object.keys(nuxtApp.payload.data).filter((key) => stems.some((stem) => key === stem || key.startsWith(`${stem}:`)))
  return refreshNuxtData(keys)
}

/** Toasts an action's failure, worded by the server when it can, and reports it to the server's logs. */
/** How long a toast stays: long enough to read it (about 15 characters a second on top of 4 s), 6 to 15 s. */
const readingTime = (...texts: Array<string | undefined>) => Math.min(15_000, Math.max(6_000, 4_000 + texts.join(" ").length * 65))

export function useNotify() {
  const toast = useToast()
  return {
    error: (error: unknown, title = translate('thatDidnTWork')) => {
      reportClientError("toast", error, { title })
      const description = errorText(error)
      return toast.add({ title, description, color: "error", icon: "i-lucide-circle-alert", duration: readingTime(title, description) })
    },
    success: (title: string, description?: string) =>
      toast.add({ title, description, icon: "i-lucide-circle-check", duration: readingTime(title, description) }),
  }
}
