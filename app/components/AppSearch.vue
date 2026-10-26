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
    label: "Pages",
    items: [...MAIN_PAGES, ...CONNECT_PAGES, ...SECONDARY_PAGES].map((page) => ({
      label: page.label,
      icon: page.icon,
      to: page.to,
      kbds: ["g", page.key],
    })),
  },
  {
    id: "accounts",
    label: "Accounts",
    items: accounts.value.map((account) => ({
      label: account.name,
      suffix: account.institution ?? ACCOUNT_KINDS[account.kind].label,
      icon: ACCOUNT_KINDS[account.kind].icon,
      to: `/accounts/${account.id}`,
    })),
  },
  {
    id: "actions",
    label: "Actions",
    items: [
      { label: "Connect a bank", icon: "i-lucide-landmark", to: "/connect/banks#bank" },
      { label: "Add a crypto wallet", icon: "i-lucide-wallet", to: "/connect/crypto#wallet" },
      { label: "Connect an exchange", icon: "i-lucide-bitcoin", to: "/connect/crypto#exchange" },
      { label: "Connect Interactive Brokers", icon: "i-lucide-chart-candlestick", to: "/connect/crypto#broker" },
      { label: "Add a manual account", icon: "i-lucide-plus", to: "/accounts?new=1" },
      { label: "Import a CSV", icon: "i-lucide-upload", to: "/connect/banks#import" },
      { label: "Invite someone to the household", icon: "i-lucide-user-plus", to: "/household?invite=1" },
      { label: "Connect an agent (MCP)", icon: "i-lucide-bot", to: "/settings/agents" },
      ...(shared.value
        ? [
            {
              label: scope.value === "me" ? "Show the household’s money" : "Show only my money",
              icon: scope.value === "me" ? "i-lucide-users" : "i-lucide-user",
              onSelect: () => (scope.value = scope.value === "me" ? "household" : "me"),
            },
          ]
        : []),
      {
        label: colorMode.value === "dark" ? "Switch to light theme" : "Switch to dark theme",
        icon: colorMode.value === "dark" ? "i-lucide-sun" : "i-lucide-moon",
        onSelect: () => (colorMode.preference = colorMode.value === "dark" ? "light" : "dark"),
      },
      { label: "Sign out", icon: "i-lucide-log-out", onSelect: () => void signOut() },
    ],
  },
])
</script>

<template>
  <UDashboardSearch :groups="groups" :color-mode="false" placeholder="Search pages, accounts, and actions…" shortcut="meta_k" />
</template>
