<script setup lang="ts">
// A page's top bar: its title, the Me / Household toggle, and the page's own actions on the right. On phones, where the
// sidebar folds away, a bell carries the open alerts' count.
withDefaults(defineProps<{ title: string; scoped?: boolean }>(), { scoped: true })
const route = useRoute()
const { data: alerts } = useAlerts()
const ALERT_COLOR = { critical: "error", warning: "warning", info: "neutral" } as const
</script>

<template>
  <UDashboardNavbar :title="title" :ui="{ right: 'gap-2', title: 'text-sm font-semibold text-highlighted' }">
    <template #leading>
      <UDashboardSidebarCollapse class="hidden lg:inline-flex" :aria-label="$t('toggleSidebar')" />
      <slot name="leading" />
    </template>
    <template #right>
      <ScopeToggle v-if="scoped" />
      <slot name="right" />
      <UChip
        v-if="route.path !== '/alerts' && alerts?.open"
        :text="alerts.open"
        :color="ALERT_COLOR[alerts.severity ?? 'info']"
        size="3xl"
        inset
        class="lg:hidden"
      >
        <UButton to="/alerts" icon="i-lucide-bell" color="neutral" variant="ghost" class="size-10 justify-center" :aria-label="$t('openAlerts', { count: alerts.open }, alerts.open)" />
      </UChip>
    </template>
  </UDashboardNavbar>
</template>
