<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui"
import { CURRENCIES } from "#shared/money"

// shadcn's NavUser: the account row at the bottom of the sidebar, opening upward with the theme, the currency amounts
// show in, and sign out.
defineProps<{ collapsed?: boolean }>()
const { data: me } = useMe()
const signOut = useSignOut()
const colorMode = useColorMode()
const money = useDisplayCurrency()
const items = computed<DropdownMenuItem[][]>(() => [
  [{ type: "label", slot: "account" as const }],
  [
    { get label() { return translate('profile') }, icon: "i-lucide-user", to: "/settings" },
    { get label() { return translate('security') }, icon: "i-lucide-shield", to: "/settings/security" },
    { get label() { return translate('agentsAndApiKeys') }, icon: "i-lucide-bot", to: "/settings/agents" },
  ],
  [
    {
      get label() { return translate('theme') },
      icon: colorMode.value === "dark" ? "i-lucide-moon" : "i-lucide-sun",
      children: [
        { get label() { return translate('light') }, icon: "i-lucide-sun", type: "checkbox", checked: colorMode.preference === "light", onSelect: () => (colorMode.preference = "light") },
        { get label() { return translate('dark') }, icon: "i-lucide-moon", type: "checkbox", checked: colorMode.preference === "dark", onSelect: () => (colorMode.preference = "dark") },
        { get label() { return translate('system') }, icon: "i-lucide-monitor", type: "checkbox", checked: colorMode.preference === "system", onSelect: () => (colorMode.preference = "system") },
      ],
    },
    {
      label: `${translate('currency')} · ${money.currency.value}`,
      icon: "i-lucide-coins",
      children: CURRENCIES.map((code) => ({
        label: code === money.household.value ? translate('householdCurrencyOption', { currency: code }) : code,
        type: "checkbox" as const,
        checked: money.currency.value === code,
        onSelect: () => void money.select(code),
      })),
    },
  ],
  [{ get label() { return translate('signOut') }, icon: "i-lucide-log-out", onSelect: () => void signOut() }],
])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ side: 'top', align: 'start', sideOffset: 6 }"
    :ui="{ content: collapsed ? 'w-60' : 'w-(--reka-dropdown-menu-trigger-width) min-w-56' }"
  >
    <button
      type="button"
      class="flex h-12 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-1.5 text-left transition-colors duration-150 hover:bg-accented/60 focus-visible:outline-2 focus-visible:outline-primary data-[state=open]:bg-accented"
      :class="collapsed && 'justify-center'"
      :aria-label="$t('accountMenu')"
    >
      <UAvatar :alt="me?.user.name ?? $t('you')" :src="me?.user.image ?? undefined" size="sm" class="rounded-md" />
      <span v-if="!collapsed" class="min-w-0 flex-1 leading-tight">
        <span class="block truncate text-sm font-medium text-highlighted">{{ me?.user.name ?? "…" }}</span>
        <span class="block truncate text-xs text-muted">{{ me?.user.email }}</span>
      </span>
      <UIcon v-if="!collapsed" name="i-lucide-chevrons-up-down" class="size-4 shrink-0 text-dimmed" />
    </button>
    <template #account>
      <div class="flex min-w-0 items-center gap-2.5 py-0.5">
        <UAvatar :alt="me?.user.name ?? $t('you')" :src="me?.user.image ?? undefined" size="md" class="rounded-md" />
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-highlighted">{{ me?.user.name }}</p>
          <p class="truncate text-xs font-normal text-muted">{{ me?.user.email }}</p>
        </div>
      </div>
    </template>
  </UDropdownMenu>
</template>
