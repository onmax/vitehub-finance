import type { ConnectionSummary } from "#shared/api"
import { AccountCreateModal, CsvImportModal } from "#components"
import type { ConnectPage } from "~/utils/connect-catalog"

/**
 * What the connect pages share: the connections that belong on the page (`connectPageOf`) in the current view, the one just linked
 * highlighted for a few seconds, and scrolling to `#bank`, `#wallet`… once the list above has loaded, so the section
 * doesn't move after the scroll. A connect dialog calls `linked` when the server linked something and `land` when people
 * leave its success screen.
 */
export function useConnectPage(page: ConnectPage) {
  const route = useRoute()
  const { data: all, status, error, refresh } = useScopedFetch<ConnectionSummary[]>("/api/connections", {
    key: "connections",
    default: () => [],
  })
  const connections = computed(() => all.value.filter((connection) => connectPageOf(connection.provider) === page))
  const highlight = ref<string | null>(null)

  const motion = usePreferredReducedMotion()
  function scrollTo(id: string) {
    nextTick(() => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: motion.value === "reduce" ? "auto" : "smooth" }))
  }
  function flash(id: string) {
    highlight.value = id
    setTimeout(() => (highlight.value = null), 4000)
  }

  // Section anchors only: `#ibkr/connect` and other catalog routes open a dialog instead (useConnectRoutes).
  const scrollWhenLoaded = (hash: string) => /^#[\w-]+$/.test(hash) && until(status).not.toBe("pending").then(() => scrollTo(hash.slice(1)))
  onMounted(() => scrollWhenLoaded(route.hash))
  watch(() => route.hash, scrollWhenLoaded)

  async function linked() {
    await refresh()
    await refreshStems("accounts", "overview", "transactions")
  }

  function land(connection: ConnectionSummary) {
    flash(connection.id)
    scrollTo(`connection-${connection.id}`)
  }

  return { connections, status, error, refresh, highlight, flash, scrollTo, linked, land }
}

/** Adding money without a connection: a manual account, or a CSV export from any bank or broker. */
export function useAccountAdders() {
  const notify = useNotify()
  const overlay = useOverlay()
  const manualModal = overlay.create(AccountCreateModal, { destroyOnClose: true })
  const importModal = overlay.create(CsvImportModal, { destroyOnClose: true })

  async function addManual() {
    const account = await manualModal.open().result
    if (account) {
      notify.success(translate('added2', { value1: account.name }))
      await navigateTo(`/accounts/${account.id}`)
    }
  }

  async function importCsv() {
    const result = await importModal.open().result
    if (result) {
      notify.success(translate('transactionsImported', { value1: formatCount(result.added) }), result.skipped ? translate('wereAlreadyThere', { value1: formatCount(result.skipped) }) : undefined)
      await refreshStems("accounts", "overview", "transactions", "recurring", "forecast", "budgets")
    }
  }

  return { addManual, importCsv }
}
