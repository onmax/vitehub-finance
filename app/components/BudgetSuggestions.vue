<script setup lang="ts">
import type { BudgetSuggestion } from "#shared/api"

defineProps<{ items: BudgetSuggestion[]; currency: string }>()
const emit = defineEmits<{ choose: [suggestion: BudgetSuggestion] }>()
const { find } = useCategories()
</script>

<template>
  <section v-if="items.length" aria-labelledby="budget-suggestions-title">
    <h2 id="budget-suggestions-title" class="text-sm font-medium text-highlighted">{{ $t('budgetSuggestionsTitle') }}</h2>
    <p class="mt-1 max-w-2xl text-sm text-muted">{{ $t('budgetSuggestionsDescription') }}</p>
    <ul class="mt-4 grid gap-3 sm:grid-cols-2">
      <li v-for="item in items.slice(0, 6)" :key="item.categoryId" class="flex min-w-0 items-center gap-3 rounded-lg border border-default p-3">
        <CategoryIcon :icon="find(item.categoryId)?.icon" :color="find(item.categoryId)?.color" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-highlighted">{{ find(item.categoryId)?.name }}</p>
          <p class="mt-1 text-xs text-muted"><Money :minor="item.amountMinor" :currency="currency" /> · {{ $t('budgetAverageMonths', { count: item.sampleMonths.length }, item.sampleMonths.length) }}</p>
          <p class="mt-1 text-xs text-muted">{{ item.sampleMonths.map((month) => formatMonth(month)).join(', ') }}</p>
        </div>
        <UButton icon="i-lucide-plus" color="neutral" variant="outline" :aria-label="$t('budgetCreateForCategory', { category: find(item.categoryId)?.name ?? $t('category') })" @click="emit('choose', item)" />
      </li>
    </ul>
  </section>
</template>
