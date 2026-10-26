<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui"

// shadcn's NavUser: the account row at the bottom of the sidebar, opening upward with the theme and sign out.
defineProps<{ collapsed?: boolean }>()
const { data: me } = useMe()
const signOut = useSignOut()
const colorMode = useColorMode()
const items = computed<DropdownMenuItem[][]>(() => [
  [{ type: "label", slot: "account" as const }],
  [
    { label: "Profile", icon: "i-lucide-user", to: "/settings" },
    { label: "Security", icon: "i-lucide-shield", to: "/settings/security" },
    { label: "Agents and API keys", icon: "i-lucide-bot", to: "/settings/agents" },
  ],
  [
    {
      label: "Theme",
      icon: colorMode.value === "dark" ? "i-lucide-moon" : "i-lucide-sun",
      children: [
        { label: "Light", icon: "i-lucide-sun", type: "checkbox", checked: colorMode.preference === "light", onSelect: () => (colorMode.preference = "light") },
        { label: "Dark", icon: "i-lucide-moon", type: "checkbox", checked: colorMode.preference === "dark", onSelect: () => (colorMode.preference = "dark") },
        { label: "System", icon: "i-lucide-monitor", type: "checkbox", checked: colorMode.preference === "system", onSelect: () => (colorMode.preference = "system") },
      ],
    },
  ],
  [{ label: "Sign out", icon: "i-lucide-log-out", onSelect: () => void signOut() }],
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
      aria-label="Account menu"
    >
      <UAvatar :alt="me?.user.name ?? 'You'" :src="me?.user.image ?? undefined" size="sm" class="rounded-md" />
      <span v-if="!collapsed" class="min-w-0 flex-1 leading-tight">
        <span class="block truncate text-sm font-medium text-highlighted">{{ me?.user.name ?? "…" }}</span>
        <span class="block truncate text-xs text-muted">{{ me?.user.email }}</span>
      </span>
      <UIcon v-if="!collapsed" name="i-lucide-chevrons-up-down" class="size-4 shrink-0 text-dimmed" />
    </button>
    <template #account>
      <div class="flex min-w-0 items-center gap-2.5 py-0.5">
        <UAvatar :alt="me?.user.name ?? 'You'" :src="me?.user.image ?? undefined" size="md" class="rounded-md" />
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-highlighted">{{ me?.user.name }}</p>
          <p class="truncate text-xs font-normal text-muted">{{ me?.user.email }}</p>
        </div>
      </div>
    </template>
  </UDropdownMenu>
</template>
