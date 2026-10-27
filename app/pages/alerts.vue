<script setup lang="ts">
import type { Alert, AlertKind } from "#shared/api"

// The alerts inbox (Quiver's alerts): open ones grouped by kind, most urgent first, each with its one action and a
// dismiss that can be undone; dismissed ones under their own tab. Alert settings opens beside it.
const { data, error, refresh } = useAlerts()
const toast = useToast()
const notify = useNotify()
const settingsOpen = ref(false)
const tab = ref<"open" | "dismissed">("open")

const KINDS: Array<{ kind: AlertKind; icon: string; readonly label: string }> = [
  { kind: "connection", icon: "i-lucide-landmark", get label() { return translate('alertKindConnection') } },
  { kind: "low_balance", icon: "i-lucide-trending-down", get label() { return translate('alertKindLowBalance') } },
  { kind: "budget", icon: "i-lucide-chart-pie", get label() { return translate('alertKindBudget') } },
  { kind: "large_transaction", icon: "i-lucide-receipt", get label() { return translate('alertKindLargeTransaction') } },
  { kind: "price_increase", icon: "i-lucide-badge-percent", get label() { return translate('alertKindPriceIncrease') } },
]
const open = computed(() => data.value?.alerts.filter((alert) => !alert.dismissedAt) ?? [])
const dismissed = computed(() => data.value?.alerts.filter((alert) => alert.dismissedAt) ?? [])
const shown = computed(() => (tab.value === "open" ? open.value : dismissed.value))
const groups = computed(() => KINDS.map((entry) => ({ ...entry, alerts: shown.value.filter((alert) => alert.kind === entry.kind) })).filter((group) => group.alerts.length))
const tabs = computed(() => [
  { value: "open", label: translate('alertsOpen'), badge: open.value.length ? { label: String(open.value.length), color: "neutral" as const, variant: "soft" as const } : undefined },
  { value: "dismissed", label: translate('alertsDismissedTab') },
])

/** Marks it here first, so the row moves at once; the server catches up, and Undo puts it back. */
function mark(alert: Alert, dismissedAt: string | null) {
  if (!data.value) return
  data.value = {
    ...data.value,
    alerts: data.value.alerts.map((entry) => (entry.key === alert.key ? { ...entry, dismissedAt } : entry)),
    open: data.value.open + (dismissedAt ? -1 : 1),
  }
}
async function dismiss(alert: Alert) {
  mark(alert, new Date().toISOString())
  try {
    await $fetch("/api/alerts/dismiss", { method: "POST", body: { key: alert.key } })
    toast.add({ title: translate('alertDismissedToast'), icon: "i-lucide-check", actions: [{ label: translate('undo'), color: "neutral", variant: "outline", onClick: () => void restore(alert) }] })
  } catch (cause) {
    mark(alert, null)
    notify.error(cause)
  }
}
async function restore(alert: Alert) {
  mark(alert, null)
  try {
    await $fetch("/api/alerts/restore", { method: "POST", body: { key: alert.key } })
  } catch (cause) {
    notify.error(cause)
    await refresh()
  }
}
</script>

<template>
  <UDashboardPanel id="alerts">
    <template #header>
      <PageNavbar :title="$t('alerts')" :scoped="false">
        <template #right>
          <UButton color="neutral" variant="outline" icon="i-lucide-sliders-horizontal" :label="$t('alertSettings')" class="hidden sm:inline-flex" @click="settingsOpen = true" />
          <UButton color="neutral" variant="outline" icon="i-lucide-sliders-horizontal" :aria-label="$t('alertSettings')" class="size-10 justify-center sm:hidden" @click="settingsOpen = true" />
        </template>
      </PageNavbar>
      <UDashboardToolbar>
        <template #left>
          <UTabs v-model="tab" :items="tabs" :content="false" variant="link" size="sm" :ui="{ list: 'border-none', trigger: 'pb-2.5' }" />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <PageError v-if="error && !data" :error="error" :title="$t('alertsDidntLoad')" @retry="refresh()" />

        <div v-else-if="!data" class="flex flex-col gap-8">
          <div v-for="group in 2" :key="group">
            <USkeleton class="h-3 w-40" />
            <div class="mt-3 divide-y divide-default border-t border-default">
              <div v-for="row in 2" :key="row" class="flex items-center gap-3 py-3.5">
                <USkeleton class="size-9 rounded-md" />
                <div class="flex-1"><USkeleton class="h-4 w-56" /><USkeleton class="mt-1.5 h-3 w-72" /></div>
                <USkeleton class="h-8 w-24" />
              </div>
            </div>
          </div>
        </div>

        <UEmpty
          v-else-if="!groups.length"
          variant="naked"
          :icon="tab === 'open' ? 'i-lucide-bell' : 'i-lucide-archive'"
          :title="tab === 'open' ? $t('alertsCaughtUp') : $t('alertsNoneDismissed')"
          :description="tab === 'open' ? $t('alertsCaughtUpHelp') : $t('alertsNoneDismissedHelp')"
          :actions="tab === 'open' ? [{ label: $t('alertSettings'), icon: 'i-lucide-sliders-horizontal', color: 'neutral', variant: 'outline', onClick: () => (settingsOpen = true) }] : undefined"
          class="py-16"
        />

        <section v-for="group in groups" v-else :key="group.kind" :aria-labelledby="`alerts-${group.kind}`">
          <h2 :id="`alerts-${group.kind}`" class="flex items-center gap-2 font-mono text-[11px] font-medium tracking-wider text-muted uppercase">
            <UIcon :name="group.icon" class="size-3.5" aria-hidden="true" />{{ group.label }}
            <span class="tabular-nums text-dimmed">{{ group.alerts.length }}</span>
          </h2>
          <ul class="mt-2 divide-y divide-default border-t border-default">
            <AlertRow v-for="alert in group.alerts" :key="alert.key" :alert="alert" @dismiss="dismiss(alert)" @restore="restore(alert)" />
          </ul>
        </section>
      </div>
      <AlertSettingsSlideover v-model:open="settingsOpen" />
    </template>
  </UDashboardPanel>
</template>
