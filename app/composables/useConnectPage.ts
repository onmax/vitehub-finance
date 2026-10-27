import type { ConnectionSummary } from "#shared/api"

/**
 * What both connect pages share: the connections that belong on the page (`connectPageOf`), the one just linked
 * highlighted for a few seconds, and scrolling to `#bank`, `#wallet`… once the list above has loaded, so the section
 * doesn't move after the scroll. `connected` is what a form calls when it linked something.
 */
export function useConnectPage(page: "/connect/banks" | "/connect/crypto") {
  const route = useRoute()
  const notify = useNotify()
  const { data: all, status, error, refresh } = useScopedFetch<ConnectionSummary[]>("/api/connections", {
    key: "connections",
    unscoped: true,
    default: () => [],
  })
  const connections = computed(() => all.value.filter((connection) => connectPageOf(connection.provider) === page))
  const highlight = ref<string | null>(null)

  const motion = usePreferredReducedMotion()
  function scrollTo(selector: string) {
    nextTick(() => document.querySelector(selector)?.scrollIntoView({ block: "start", behavior: motion.value === "reduce" ? "auto" : "smooth" }))
  }
  function flash(id: string) {
    highlight.value = id
    setTimeout(() => (highlight.value = null), 4000)
  }

  const scrollWhenLoaded = (hash: string) => hash && until(status).not.toBe("pending").then(() => scrollTo(hash))
  onMounted(() => scrollWhenLoaded(route.hash))
  watch(() => route.hash, scrollWhenLoaded)

  async function connected(connection: ConnectionSummary) {
    await refresh()
    await refreshStems("accounts", "overview", "transactions")
    notify.success(translate('connected3', { value1: connection.name }), connection.status === "error" ? (connection.lastError ? providerErrorText(connection.lastError, connection.lastErrorCode) : undefined) : translate('itsBalanceIsInYourAccountsNow'))
    flash(connection.id)
    scrollTo(`#connection-${connection.id}`)
  }

  return { connections, status, error, refresh, highlight, flash, scrollTo, connected }
}
