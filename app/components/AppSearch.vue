<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from "@nuxt/ui"

// ⌘K: the app's pages, the accounts you see, and the things you'd do (connect, import, add, invite), plus the theme.
const { data: accounts } = useAccounts()
const scope = useScope()
const shared = useShared()
const signOut = useSignOut()
const colorMode = useColorMode()

const groups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => [
  {
    id: "pages",
    get label() { return translate('pages') },
    items: [...MAIN_PAGES, ...CONNECT_PAGES, ...SECONDARY_PAGES].map((page) => ({
      label: page.label,
      icon: page.icon,
      to: page.to,
      kbds: ["g", page.key],
    })),
  },
  {
    id: "accounts",
    get label() { return translate('accounts') },
    items: accounts.value.map((account) => ({
      label: account.name,
      suffix: account.institution ?? ACCOUNT_KINDS[account.kind].label,
      icon: ACCOUNT_KINDS[account.kind].icon,
      to: `/accounts/${account.id}`,
    })),
  },
  {
    id: "actions",
    get label() { return translate('actions') },
    items: [
      { get label() { return translate('connectABank') }, icon: "i-lucide-landmark", to: "/connect/banks#bank" },
      { get label() { return translate('addACryptoWallet') }, icon: "i-lucide-wallet", to: "/connect/crypto#wallet" },
      { get label() { return translate('connectAnExchange') }, icon: "i-lucide-bitcoin", to: "/connect/crypto#exchange" },
      { get label() { return translate('connectInteractiveBrokers') }, icon: "i-lucide-chart-candlestick", to: "/connect/crypto#broker" },
      { get label() { return translate('addAManualAccount') }, icon: "i-lucide-plus", to: "/accounts?new=1" },
      { get label() { return translate('importACsv') }, icon: "i-lucide-upload", to: "/connect/banks#import" },
      { get label() { return translate('inviteSomeoneToTheHousehold') }, icon: "i-lucide-user-plus", to: "/household?invite=1" },
      { get label() { return translate('connectAnAgentMcp') }, icon: "i-lucide-bot", to: "/settings/agents" },
      ...(shared.value
        ? [
            {
              label: scope.value === "me" ? translate('showTheHouseholdSMoney') : translate('showOnlyMyMoney'),
              icon: scope.value === "me" ? "i-lucide-users" : "i-lucide-user",
              onSelect: () => (scope.value = scope.value === "me" ? "household" : "me"),
            },
          ]
        : []),
      {
        label: colorMode.value === "dark" ? translate('switchToLightTheme') : translate('switchToDarkTheme'),
        icon: colorMode.value === "dark" ? "i-lucide-sun" : "i-lucide-moon",
        onSelect: () => (colorMode.preference = colorMode.value === "dark" ? "light" : "dark"),
      },
      { get label() { return translate('signOut') }, icon: "i-lucide-log-out", onSelect: () => void signOut() },
    ],
  },
])
</script>

<template>
  <UDashboardSearch :groups="groups" :color-mode="false" :placeholder="$t('searchPagesAccountsAndActions')" shortcut="meta_k" />
</template>
