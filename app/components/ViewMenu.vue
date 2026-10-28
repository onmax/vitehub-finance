<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui"

// The sidebar's header (shadcn's TeamSwitcher): whose money the app shows. Personal is your own accounts, connections and
// agents; Household adds what the other members share with it. People join from the Household page, not from here.
defineProps<{ collapsed?: boolean }>()
const { data: me } = useMe()
const scope = useScope()
const householdName = computed(() => me.value?.household.name ?? translate("household"))
const people = computed(() => {
  const count = me.value?.members.length ?? 1
  return count === 1 ? translate("justYou") : translate("people", { value1: count })
})
const items = computed<DropdownMenuItem[][]>(() => [
  [{ type: "label", label: translate("whoseMoneyToShow") }],
  [
    {
      label: translate("personal"),
      description: translate("personalViewHint"),
      icon: "i-lucide-user",
      type: "checkbox",
      checked: scope.value === "me",
      onSelect: () => (scope.value = "me"),
    },
    {
      label: householdName.value,
      description: translate("householdViewHint", { value1: people.value }),
      icon: "i-lucide-users",
      type: "checkbox",
      checked: scope.value === "household",
      onSelect: () => (scope.value = "household"),
    },
  ],
])
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'start', sideOffset: 4 }" :ui="{ content: 'w-72 max-w-[calc(100vw-2rem)]', item: 'items-start py-2.5', itemLeadingIcon: 'mt-0.5', itemDescription: 'whitespace-normal text-pretty', itemLabel: 'whitespace-normal' }">
    <button
      type="button"
      class="flex h-11 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-1.5 text-left transition-colors duration-150 hover:bg-accented/60 focus-visible:outline-2 focus-visible:outline-primary data-[state=open]:bg-accented"
      :class="collapsed && 'justify-center'"
      :aria-label="$t('viewMenu', { value1: scope === 'me' ? $t('personal') : householdName })"
    >
      <UAvatar v-if="scope === 'me'" :alt="me?.user.name ?? $t('you')" :src="me?.user.image ?? undefined" size="sm" class="rounded-md" />
      <span v-else class="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <UIcon name="i-lucide-users" class="size-4" />
      </span>
      <span v-if="!collapsed" class="min-w-0 flex-1 leading-tight">
        <span class="block truncate text-sm font-semibold text-highlighted">{{ scope === "me" ? $t("personal") : householdName }}</span>
        <span class="block truncate text-xs text-muted">{{ scope === "me" ? (me?.user.name ?? "…") : $t("householdLabel", { value1: people }) }}</span>
      </span>
      <UIcon v-if="!collapsed" name="i-lucide-chevrons-up-down" class="size-4 shrink-0 text-dimmed" />
    </button>
  </UDropdownMenu>
</template>
