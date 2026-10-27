<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui"
import type { AccountSummary } from "#shared/api"

// The signed-in shell: shadcn's sidebar (household header, main pages, what's syncing, Household and Settings, the
// account menu) on Nuxt UI's dashboard, collapsible to icons and resizable on desktop, a drawer on phones. ⌘K opens AppSearch; `g` then
// a letter jumps to a page.
const route = useRoute()
const open = ref(false)
const isActive = (to: string) => (to === "/" ? route.path === "/" : route.path === to || route.path.startsWith(`${to}/`))
// Connections that need someone (expired consent, failed sync) badge their connect page. The same request the overview
// makes.
const { data: overview } = useOverview()
const attention = (to: string) => overview.value?.attention.filter((connection) => connectPageOf(connection.provider) === to).length ?? 0
// Open alerts badge their page, in the color of the most urgent one.
const { data: alerts } = useAlerts()
const ALERT_COLOR = { critical: "error", warning: "warning", info: "neutral" } as const

// The public demo's banner sits above the whole shell, which starts below it.
const demo = useDemoPerson()

const toItem = (page: { label: string; icon: string; to: string }): NavigationMenuItem => {
  const count = page.to === "/alerts" ? (alerts.value?.open ?? 0) : attention(page.to)
  const color = page.to === "/alerts" ? ALERT_COLOR[alerts.value?.severity ?? "info"] : "warning"
  return {
    label: page.label,
    icon: page.icon,
    to: page.to,
    active: isActive(page.to),
    badge: count ? { label: String(count), color, variant: "subtle" } : undefined,
    onSelect: () => (open.value = false),
  }
}
// Accounts lists them under it, open while you're on one of its pages; the chevron opens or closes it anywhere. A
// connection with several accounts (a bank's currency pockets) folds them under one row named for the bank, open while
// you're on one of them, each labeled without the bank's name in front. The menu only reads which items start open when
// it mounts, so it mounts again once the accounts arrive and as you move between those groups.
const { data: accounts } = useAccounts()
const inAccounts = computed(() => isActive("/accounts"))
const accountLink = (account: AccountSummary, label = account.name): NavigationMenuItem => ({
  label,
  to: `/accounts/${account.id}`,
  active: route.path === `/accounts/${account.id}`,
  onSelect: () => (open.value = false),
})
const withoutBank = (name: string, bank: string) => (name.toLowerCase().startsWith(`${bank.toLowerCase()} `) ? name.slice(bank.length + 1) : name)
const accountGroups = computed(() => {
  const groups = new Map<string, AccountSummary[]>()
  for (const account of accounts.value) {
    const key = account.connectionId ?? account.id
    groups.set(key, [...(groups.get(key) ?? []), account])
  }
  return [...groups.entries()].map(([key, members]) => ({ key, members, bank: members[0]!.institution ?? members[0]!.name }))
})
const openGroup = computed(() => accountGroups.value.find((group) => group.members.length > 1 && group.members.some((account) => route.path === `/accounts/${account.id}`))?.key ?? "")
const accountItems = computed<NavigationMenuItem[]>(() =>
  accountGroups.value.map(({ key, members, bank }) =>
    members.length === 1
      ? accountLink(members[0]!)
      : {
          label: bank,
          badge: { label: String(members.length), color: "neutral", variant: "soft", size: "sm" },
          defaultOpen: key === openGroup.value,
          children: members.map((account) => accountLink(account, withoutBank(account.name, bank))),
        },
  ),
)
const main = computed(() =>
  MAIN_PAGES.map((page) =>
    page.to === "/accounts" && accountItems.value.length ? { ...toItem(page), children: accountItems.value, defaultOpen: inAccounts.value } : toItem(page),
  ),
)
const mainKey = computed(() => `${accountItems.value.length > 0}-${inAccounts.value}-${openGroup.value}`)
const connect = computed<NavigationMenuItem[]>(() => [{ get label() { return translate('connect2') }, type: "label" }, ...CONNECT_PAGES.map(toItem)])
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
          :label="$t('search')"
          class="text-muted"
          :class="collapsed ? '' : 'w-full'"
          :kbds="['meta', 'k']"
        />
        <UNavigationMenu
          :key="mainKey"
          :collapsed="collapsed"
          :items="main"
          orientation="vertical"
          tooltip
          :aria-label="$t('main')"
          :ui="{ link: 'h-9', linkLabel: 'text-sm' }"
        />
        <UNavigationMenu
          :collapsed="collapsed"
          :items="connect"
          orientation="vertical"
          tooltip
          :aria-label="$t('connect2')"
          :ui="{ link: 'h-9', linkLabel: 'text-sm', label: 'px-2.5 pt-2 pb-1 text-xs font-medium text-dimmed' }"
        />
        <!-- Pinned to the bottom, so the sync line appearing late grows into the empty space instead of moving the links. -->
        <div class="mt-auto flex flex-col gap-2">
          <SidebarSyncStatus :collapsed="collapsed" />
          <UNavigationMenu
            :collapsed="collapsed"
            :items="secondary"
            orientation="vertical"
            tooltip
            :aria-label="$t('householdAndSettings')"
            :ui="{ link: 'h-9', linkLabel: 'text-sm' }"
          />
        </div>
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <slot />

    <AppSearch />
  </UDashboardGroup>
</template>
