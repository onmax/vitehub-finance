<script setup lang="ts">
import type { SyncStatus } from "#shared/api"

// The sidebar's line about syncing (`/api/sync/status`): what's syncing now, else the connection that needs someone
// (failed, expired, or reconnect soon), else when everything last synced. It asks again every 3 s while something
// syncs and every minute otherwise, not while the tab is hidden, and as soon as it's back. When a sync finishes, the
// pages that show synced data refresh, so the dashboard never waits on a stale answer. Others refresh it by its key
// ("sync-status") after starting a sync.
defineProps<{ collapsed?: boolean }>()
const scope = useScope()
const { data: status, refresh } = useFetch<SyncStatus | null>("/api/sync/status", { key: "sync-status", query: { scope }, default: () => null, lazy: true })

const syncing = computed(() => status.value?.syncing ?? [])
const attention = computed(() => status.value?.attention ?? [])

const { start } = useTimeoutFn(
  async () => {
    if (document.visibilityState === "visible") await refresh().catch(() => {})
    start()
  },
  () => (syncing.value.length ? 3000 : 60_000),
)
watch(() => syncing.value.length, () => start())
useEventListener(document, "visibilitychange", () => document.visibilityState === "visible" && refresh())
watch(
  () => syncing.value.length,
  (now, before) => {
    if (before && !now) void refreshStems("overview", "accounts", "transactions", "flow", "budgets", "alerts", "forecast", "recurring", "connections", "goals")
  },
)

const line = computed(() => {
  if (!status.value?.connections) return null
  if (syncing.value.length)
    return {
      icon: "i-lucide-loader-circle",
      spin: true,
      tone: "text-muted",
      title: syncing.value.length === 1 ? translate('syncStatusSyncingOne', { name: syncing.value[0]!.name }) : translate('syncStatusSyncingMany', { count: syncing.value.length }),
      detail: translate('syncStatusSyncingDetail'),
      to: connectPageOf(syncing.value[0]!.provider),
    }
  const first = attention.value[0]
  if (first) {
    const reason =
      first.status === "expired"
        ? translate('consentExpired')
        : first.status === "error"
          ? providerErrorText(first.lastError, first.lastErrorCode)
          : translate('reconnectBy', { value1: formatDate(first.consentExpiresAt!) })
    return {
      icon: "i-lucide-triangle-alert",
      spin: false,
      tone: "text-warning",
      title: attention.value.length === 1 ? translate('syncStatusNeedsYouOne', { name: first.name }) : translate('syncStatusNeedsYouMany', { count: attention.value.length }),
      detail: reason,
      to: connectPageOf(first.provider),
    }
  }
  return {
    icon: "i-lucide-circle-check",
    spin: false,
    tone: "text-dimmed",
    title: translate('syncStatusUpToDate'),
    detail: translate('synced', { value1: timeAgo(status.value.lastSyncedAt) }),
    to: "/connect/banks",
  }
})
</script>

<template>
  <div v-if="line" aria-live="polite">
    <UTooltip :text="`${line.title} · ${line.detail}`" :disabled="!collapsed" :content="{ side: 'right' }">
      <ULink
        :to="line.to"
        class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-elevated"
        :class="collapsed ? 'justify-center' : ''"
        :title="collapsed ? undefined : line.detail"
      >
        <UIcon :name="line.icon" class="size-4 shrink-0" :class="[line.tone, line.spin ? 'motion-safe:animate-spin' : '']" />
        <span v-if="!collapsed" class="min-w-0 flex-1">
          <span class="block truncate text-default">{{ line.title }}</span>
          <span class="block truncate text-xs text-muted">{{ line.detail }}</span>
        </span>
        <span v-else class="sr-only">{{ line.title }}. {{ line.detail }}</span>
      </ULink>
    </UTooltip>
  </div>
</template>
