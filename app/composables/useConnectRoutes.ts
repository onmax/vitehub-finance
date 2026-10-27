import type { CatalogProvider, ConnectPage } from "~/utils/connect-catalog"
/**
 * A catalog page's overlays as hash routes, so each can be linked to (Executor's `#reworked/<domain>/auth`):
 * `#ibkr` opens a provider's details, `#ibkr/connect` its connect dialog. `aliases` keeps old anchors working
 * (`#broker` was Interactive Brokers' section). Section anchors (`#wallet`) aren't providers and only scroll.
 */
export function useConnectRoutes(page: ConnectPage, aliases: Record<string, string> = {}) {
  const route = useRoute()
  const router = useRouter()

  const target = computed(() => {
    const [id = "", action] = route.hash.replace(/^#/, "").split("/")
    const entry = catalogEntry(aliases[id] ?? id)
    if (!entry || CONNECT_KINDS[entry.kind].page !== page) return null
    return { entry, connect: action === "connect" && !entry.soon }
  })
  const detail = computed(() => (target.value && !target.value.connect ? target.value.entry : null))
  const dialog = computed(() => (target.value?.connect ? target.value.entry : null))

  const go = (hash: string) => router.replace({ query: route.query, hash })
  return {
    detail,
    dialog,
    openDetail: (entry: CatalogProvider) => go(`#${entry.id}`),
    openConnect: (entry: CatalogProvider) => go(`#${entry.id}/connect`),
    close: () => go(""),
  }
}
