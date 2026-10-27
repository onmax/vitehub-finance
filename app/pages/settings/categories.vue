<script setup lang="ts">
import type { Category } from "#shared/api"
import { CategoryModal } from "#components"

// The household's categories, grouped by kind. The rules that file transactions into them are on Settings › Rules.
useHead({ get title() { return translate('categories') } })
const { categories, status, error, refresh } = useCategories()
const confirm = useConfirm()
const notify = useNotify()
const overlay = useOverlay()
const modal = overlay.create(CategoryModal, { destroyOnClose: true })

const groups = computed(() =>
  (
    [
      { kind: "expense", get label() { return translate('spending') } },
      { kind: "income", get label() { return translate('income') } },
      { kind: "transfer", get label() { return translate('transfers') } },
    ] as const
  ).map((group) => ({
    ...group,
    items: categories.value.filter((category) => category.kind === group.kind).sort((a, b) => a.name.localeCompare(b.name)),
  })),
)

async function edit(category?: Category) {
  const saved = (await modal.open({ category }).result) as Category | undefined
  if (saved) notify.success(category ? translate('categorySaved') : translate('categoryAdded'))
}

// AI categories for what the rules missed (useAiCategorize): the same action as the Transactions page's button.
const { ready: aiReady, running: categorizing, run: categorizeWithAi } = useAiCategorize()
// The demo never asks Jev, so it has no AI settings.
const demoBuild = useDemoBuild()

async function remove(category: Category) {
  const { confirmed } = await confirm({
    title: translate('delete3', { value1: category.name }),
    get description() { return translate('itsTransactionsBecomeUncategorizedAndItsRulesAndBudgetsGo') },
    confirmLabel: translate('deleteCategory'),
    destructive: true,
  })
  if (!confirmed) return
  try {
    await $fetch(`/api/categories/${category.id}`, { method: "DELETE" })
    await Promise.all([refreshNuxtData("categories"), refreshNuxtData("rules")])
  } catch (cause) {
    notify.error(cause, translate('couldnTDeleteTheCategory'))
  }
}
</script>

<template>
  <SettingsSection :title="$t('categories')" :description="$t('everyTransactionGetsOneBudgetsAndSpendingChartsGroupBy')" flush>
    <template #actions>
      <UButton
        v-if="aiReady"
        color="neutral"
        variant="outline"
        icon="i-lucide-sparkles"
        :label="$t('categorizeUncategorizedWithAi')"
        :loading="categorizing"
        @click="categorizeWithAi"
      />
      <UButton color="neutral" variant="outline" icon="i-lucide-plus" :label="$t('addCategory')" @click="edit()" />
    </template>
    <div v-if="status === 'pending' && !categories.length" class="flex flex-col gap-3 py-4">
      <div v-for="index in 6" :key="index" class="flex items-center gap-3">
        <USkeleton class="size-8 rounded-md" />
        <USkeleton class="h-4 w-32" />
      </div>
    </div>
    <div v-else-if="error" class="py-4"><PageError :error="error" @retry="refresh()" /></div>
    <div v-else class="flex flex-col gap-6">
      <div v-for="group in groups" :key="group.kind">
        <h3 class="border-b border-default pb-2 text-xs font-medium text-muted">
          {{ group.label }} <span class="tabular-nums text-dimmed">{{ group.items.length }}</span>
        </h3>
        <p v-if="!group.items.length" class="py-3 text-sm text-muted">{{ $t('noneYet') }}</p>
        <ul class="grid gap-x-8 sm:grid-cols-2">
          <li v-for="category in group.items" :key="category.id" class="group flex min-h-12 items-center gap-3 border-b border-default py-1.5">
            <CategoryIcon :icon="category.icon" :color="category.color" />
            <span class="min-w-0 flex-1 truncate text-sm text-highlighted">{{ category.name }}</span>
            <UTooltip :text="$t('edit')">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-pencil" :aria-label="$t('edit2', { value1: category.name })" @click="edit(category)" />
            </UTooltip>
            <UTooltip :text="$t('delete2')">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-trash-2" :aria-label="$t('delete4', { value1: category.name })" @click="remove(category)" />
            </UTooltip>
          </li>
        </ul>
      </div>
    </div>
  </SettingsSection>

  <SettingsAiGateway v-if="!demoBuild" />
</template>
