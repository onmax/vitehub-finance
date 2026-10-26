<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui"

// The sidebar's header: the household as a workspace switcher (shadcn's TeamSwitcher), with its members and settings.
// Joxi has one household per person, so it opens the household's own pages instead of a list of others.
defineProps<{ collapsed?: boolean }>()
const { data: me } = useMe()
const items = computed<DropdownMenuItem[][]>(() => [
  [{ type: "label", label: me.value?.household.name ?? "Household" }],
  [
    { label: "Members and invitations", icon: "i-lucide-users", to: "/household" },
    { label: "Invite someone", icon: "i-lucide-user-plus", to: "/household?invite=1" },
  ],
  [{ label: "Connect an account", icon: "i-lucide-plug", to: "/connect" }],
])
const subtitle = computed(() => {
  const count = me.value?.members.length ?? 1
  return count === 1 ? "Just you" : `${count} people`
})
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'start', sideOffset: 4 }" :ui="{ content: 'w-60' }">
    <button
      type="button"
      class="flex h-11 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-1.5 text-left transition-colors duration-150 hover:bg-accented/60 focus-visible:outline-2 focus-visible:outline-primary data-[state=open]:bg-accented"
      :class="collapsed && 'justify-center'"
      :aria-label="`${me?.household.name ?? 'Household'} menu`"
    >
      <AppLogo mark-only />
      <span v-if="!collapsed" class="min-w-0 flex-1 leading-tight">
        <span class="block truncate text-sm font-semibold text-highlighted">{{ me?.household.name ?? "Joxi" }}</span>
        <span class="block truncate text-xs text-muted">{{ subtitle }}</span>
      </span>
      <UIcon v-if="!collapsed" name="i-lucide-chevrons-up-down" class="size-4 shrink-0 text-dimmed" />
    </button>
  </UDropdownMenu>
</template>
