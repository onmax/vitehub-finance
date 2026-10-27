<script setup lang="ts">
// Picks a category (or Uncategorized) from the household's list, searchable, each with its icon and color.
// `variant="ghost"` sits inline in a table row and looks like text until hovered.
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
    :ui="{ content: 'min-w-56', base: variant === 'ghost' ? 'px-1.5 -mx-1.5' : undefined }"
  >
    <template #leading>
      <CategoryIcon :icon="selected?.icon" :color="selected?.color" size="sm" />
    </template>
    <template #default>
      <span class="truncate" :class="selected ? 'text-default' : 'text-muted'">{{ selected?.name ?? (model === null ? (noneLabel ?? $t('uncategorized')) : placeholder ?? $t('category')) }}</span>
    </template>
    <template #item-leading="{ item }">
      <CategoryIcon :icon="item.id ? item.icon : null" :color="item.color" size="sm" />
    </template>
  </USelectMenu>
</template>
