<script setup lang="ts">
// Picks a category (or Uncategorized) from the household's list, searchable, each with its icon and color.
// `variant="ghost"` sits inline in a table row and looks like text until hovered: its tile lines up with the column, and
// its chevron only shows on hover, focus, or while open. `suggested` marks a category the AI picked, after its name.
const props = withDefaults(
  defineProps<{
    placeholder?: string
    variant?: "outline" | "ghost" | "soft"
    size?: "xs" | "sm" | "md"
    /** Offer Uncategorized (null) as a choice. */
    allowNone?: boolean
    /** What the null choice is called, when it isn't "Uncategorized" (a rule's "Don't change"). */
    noneLabel?: string
    kinds?: Array<"expense" | "income" | "transfer">
    disabled?: boolean
    ariaLabel?: string
    suggested?: boolean
  }>(),
  { variant: "outline", size: "md", allowNone: true },
)
const model = defineModel<string | null | undefined>()
const { items: all, find } = useCategories()
const items = computed(() =>
  all.value
    .filter((item) => (item.id === null ? props.allowNone : !props.kinds || props.kinds.includes(item.kind)))
    .map((item) => (item.id === null && props.noneLabel ? { ...item, name: props.noneLabel } : item)),
)
const selected = computed(() => find(model.value))
const ghost = computed(() => props.variant === "ghost")
// The tile sits 6px in and the row pulls back by as much, so the tile starts where the column does; the text starts
// 8px after the tile, and the chevron keeps its room whether it shows or not.
const GHOST = {
  content: "min-w-56",
  base: "-mx-1.5 ps-9.5 pe-7",
  leading: "ps-1.5",
  trailing: "pe-1.5",
  trailingIcon: "opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:opacity-100",
}
</script>

<template>
  <USelectMenu
    v-model="model"
    :items="items"
    value-key="id"
    label-key="name"
    :variant="variant"
    :size="size"
    :disabled="disabled"
    :placeholder="placeholder ?? $t('category')"
    :aria-label="ariaLabel ?? placeholder ?? $t('category')"
    :search-input="{ placeholder: $t('searchCategories') }"
    :ui="ghost ? GHOST : { content: 'min-w-56' }"
  >
    <template #leading>
      <CategoryIcon :icon="selected?.icon" :color="selected?.color" size="sm" />
    </template>
    <template #default>
      <span class="flex min-w-0 items-center gap-1.5">
        <span class="truncate" :class="selected ? 'text-default' : 'text-muted'">{{ selected?.name ?? (model === null ? (noneLabel ?? $t('uncategorized')) : placeholder ?? $t('category')) }}</span>
        <UTooltip v-if="suggested" :text="$t('suggestedByAiChangeItIfItSWrong')">
          <UIcon name="i-lucide-sparkles" class="size-3 shrink-0 text-dimmed" :aria-label="$t('suggestedByAi')" />
        </UTooltip>
      </span>
    </template>
    <template #item-leading="{ item }">
      <CategoryIcon :icon="item.id ? item.icon : null" :color="item.color" size="sm" />
    </template>
  </USelectMenu>
</template>
