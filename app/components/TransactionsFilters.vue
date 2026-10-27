<script setup lang="ts">
import type { AccountSummary } from "#shared/api"

// The transactions filters: who and which direction (chips), words, account, category, and dates.
type TransactionsView = "all" | "mine" | "in" | "out"

defineProps<{ accounts: AccountSummary[] }>()
const view = defineModel<TransactionsView>("view", { required: true })
const search = defineModel<string>("search", { required: true })
const account = defineModel<string>("account", { required: true })
const category = defineModel<string>("category", { required: true })
const from = defineModel<string>("from", { required: true })
const to = defineModel<string>("to", { required: true })

const shared = useShared()
const { categories } = useCategories()
const chips = computed(() =>
  [
    { value: "all" as const, get label() { return translate('all') } },
    ...(shared.value ? [{ value: "mine" as const, get label() { return translate('mine') } }] : []),
    { value: "in" as const, get label() { return translate('moneyIn') } },
    { value: "out" as const, get label() { return translate('moneyOut') } },
  ],
)
const categoryItems = computed(() => [
  { id: "", get name() { return translate('allCategories') }, icon: "i-lucide-layers", color: "neutral" },
  { id: "none", get name() { return translate('uncategorized') }, icon: "", color: "neutral" },
  ...[...categories.value].sort((a, b) => a.name.localeCompare(b.name)),
])
const accountItems = (list: AccountSummary[]) => [{ id: "", get name() { return translate('allAccounts') } }, ...list.map(({ id, name }) => ({ id, name }))]
const chosenCategory = computed(() => categoryItems.value.find((item) => item.id === category.value))
const searchInput = useTemplateRef("searchInput")
defineShortcuts({ "/": () => searchInput.value?.inputRef?.focus() })
const filtered = computed(() => Boolean(search.value || account.value || category.value || from.value || to.value || view.value !== "all"))
function clear() {
  view.value = "all"
  search.value = ""
  account.value = ""
  category.value = ""
  from.value = ""
  to.value = ""
}
</script>

<template>
  <div class="flex w-full min-w-0 flex-wrap items-center gap-2">
    <div role="radiogroup" :aria-label="$t('show')" class="flex shrink-0 items-center gap-1">
      <button
        v-for="chip in chips"
        :key="chip.value"
        type="button"
        role="radio"
        :aria-checked="view === chip.value"
        class="h-10 cursor-pointer rounded-full sm:h-8 border px-3 text-sm font-medium transition-[color,background-color,border-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
        :class="
          view === chip.value
            ? 'border-transparent bg-inverted text-inverted'
            : 'border-default text-muted hover:bg-elevated hover:text-highlighted'
        "
        @click="view = chip.value"
      >
        {{ chip.label }}
      </button>
    </div>
    <UInput
      ref="searchInput"
      v-model="search"
      icon="i-lucide-search"
      :placeholder="$t('search')"
      :aria-label="$t('searchTransactions')"
      class="w-full sm:w-56"
      :ui="{ trailing: 'pe-1' }"
    >
      <template #trailing>
        <UButton
          v-if="search"
          color="neutral"
          variant="link"
          size="sm"
          icon="i-lucide-x"
          :aria-label="$t('clearSearch')"
          @click="search = ''"
        />
        <UKbd v-else value="/" class="hidden sm:inline-flex" />
      </template>
    </UInput>
    <div class="flex w-full min-w-0 flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
    <USelectMenu
      v-model="account"
      :items="accountItems(accounts)"
      value-key="id"
      label-key="name"
      icon="i-lucide-landmark"
      :aria-label="$t('account')"
      :search-input="{ placeholder: $t('searchAccounts') }"
      class="w-full shrink-0 sm:w-60"
      :ui="{ content: 'min-w-56' }"
    />
    <USelectMenu
      v-model="category"
      :items="categoryItems"
      value-key="id"
      label-key="name"
      :aria-label="$t('category')"
      :search-input="{ placeholder: $t('searchCategories') }"
      class="w-full shrink-0 sm:w-60"
      :ui="{ content: 'min-w-56' }"
    >
      <template #leading>
        <CategoryIcon v-if="chosenCategory?.id" :icon="chosenCategory.icon || null" :color="chosenCategory.color" size="sm" />
        <UIcon v-else name="i-lucide-layers" class="size-4 text-dimmed" />
      </template>
      <template #item-leading="{ item }">
        <CategoryIcon v-if="item.id" :icon="item.icon || null" :color="item.color" size="sm" />
        <span v-else class="grid size-6 place-items-center"><UIcon name="i-lucide-layers" class="size-4 text-dimmed" /></span>
      </template>
    </USelectMenu>
    <TransactionsDateRange v-model:from="from" v-model:to="to" />
    </div>
    <UButton v-if="filtered" color="neutral" variant="ghost" :label="$t('clearFilters')" @click="clear" />
  </div>
</template>
