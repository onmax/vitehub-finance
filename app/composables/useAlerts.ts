import type { AlertsResponse, ConnectionSummary } from "#shared/api"

/** The caller's alerts, shared by the sidebar's badge and the Alerts page; mounting either fetches them again. */
export function useAlerts() {
  return useFetch<AlertsResponse | null>("/api/alerts", { key: "alerts", default: () => null })
}

/** Reconnects a bank (its sign-in page) or syncs another provider again: what a connection alert asks for. */
export function useReconnect() {
  const notify = useNotify()
  const pending = ref<string | null>(null)
  async function reconnect(connection: ConnectionSummary) {
    pending.value = connection.id
    try {
      if (connection.provider === "enable_banking") {
        const { url } = await $fetch<{ url: string }>(`/api/connections/${connection.id}/reconnect`, { method: "POST" })
        window.location.href = url
        return
      }
      await $fetch(`/api/connections/${connection.id}/sync`, { method: "POST" })
      notify.success(translate('synced2'), connection.name)
      await refreshStems("overview", "accounts", "connections", "alerts")
    } catch (error) {
      notify.error(error, connection.provider === "enable_banking" ? translate('couldnTReconnect', { value1: connection.name }) : translate('couldnTSync', { value1: connection.name }))
    } finally {
      pending.value = null
    }
  }
  /** Why the connection needs someone, in a sentence. */
  function reason(connection: ConnectionSummary) {
    if (connection.status === "error") return (connection.lastError && providerErrorText(connection.lastError, connection.lastErrorCode)) || translate('theLastSyncFailedTryAgain')
    if (connection.status === "expired") return translate('theBankSConsentExpiredReconnectToKeepSyncing')
    if (connection.consentExpiresAt) return translate('consentEndsReconnectBeforeThenToKeepSyncing', { value1: formatDate(connection.consentExpiresAt) })
    return translate('checkThisConnection')
  }
  return { pending, reconnect, reason }
}
