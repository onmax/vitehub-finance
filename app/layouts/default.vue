<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui"

// The signed-in shell: shadcn's sidebar (household header, main pages, Household and Settings, the account menu) on
// Nuxt UI's dashboard, collapsible to icons and resizable on desktop, a drawer on phones. ⌘K opens AppSearch; `g` then
// a letter jumps to a page.
const route = useRoute()
const open = ref(false)
const isActive = (to: string) => (to === "/" ? route.path === "/" : route.path === to || route.path.startsWith(`${to}/`))
// Connections that need someone (expired consent, failed sync) badge their connect page. The same request the overview
// makes.
const { data: overview } = useOverview()
const attention = (to: string) => overview.value?.attention.filter((connection) => connectPageOf(connection.provider) === to).length ?? 0

// The public demo's banner sits above the whole shell, which starts below it.
const demo = useDemo()

const toItem = (page: { label: string; icon: string; to: string }): NavigationMenuItem => {
  const count = attention(page.to)
  return {
    label: page.label,
    icon: page.icon,
    to: page.to,
    active: isActive(page.to),
    badge: count ? { label: String(count), color: "warning", variant: "subtle" } : undefined,
    onSelect: () => (open.value = false),
  }
}
const main = computed(() => MAIN_PAGES.map(toItem))
const connect = computed<NavigationMenuItem[]>(() => [{ label: "Connect", type: "label" }, ...CONNECT_PAGES.map(toItem)])
const secondary = computed(() => SECONDARY_PAGES.map(toItem))

// `g o`, `g t`… like GitHub and Linear.
defineShortcuts(
  Object.fromEntries([...MAIN_PAGES, ...CONNECT_PAGES, ...SECONDARY_PAGES].map((page) => [`g-${page.key}`, () => navigateTo(page.to)])),
)
</script>

<template>
  <DemoBanner v-if="demo" class="fixed inset-x-0 top-0 z-40" />
  <UDashboardGroup unit="rem" storage="local" storage-key="finance-sidebar" :class="demo ? 'top-[calc(2.25rem+env(safe-area-inset-top))]' : undefined">
    <UDashboardSidebar
      id="nav"
      v-model:open="open"
      collapsible
      resizable
      :default-size="15"
      :min-size="13"
      :max-size="20"
      :ui="{
        root: 'bg-muted',
        header: 'h-14 px-2',
        body: 'gap-4 px-2 py-2',
        footer: 'border-t border-default p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]',
      }"
    >
      <template #header="{ collapsed }">
        <HouseholdMenu :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton
          :collapsed="collapsed"
          label="Search"
          class="text-muted"
          :class="collapsed ? '' : 'w-full'"
          :kbds="['meta', 'k']"
        />
        <UNavigationMenu
          :collapsed="collapsed"
          :items="main"
          orientation="vertical"
          tooltip
          aria-label="Main"
          :ui="{ link: 'h-9', linkLabel: 'text-sm' }"
        />
        <UNavigationMenu
          :collapsed="collapsed"
          :items="connect"
          orientation="vertical"
          tooltip
          aria-label="Connect"
          :ui="{ link: 'h-9', linkLabel: 'text-sm', label: 'px-2.5 pt-2 pb-1 text-xs font-medium text-dimmed' }"
        />
        <UNavigationMenu
          :collapsed="collapsed"
          :items="secondary"
          orientation="vertical"
          tooltip
          class="mt-auto"
          aria-label="Household and settings"
          :ui="{ link: 'h-9', linkLabel: 'text-sm' }"
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <slot />

    <AppSearch />
  </UDashboardGroup>
</template>
