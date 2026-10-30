<script setup lang="ts">
import type { Budget } from "#shared/api"

// A category's budget for the month: how much is spent, a bar that turns amber past 85% and red past 100%, and what's
// left or over in words (color never says it alone).
const props = defineProps<{ budget: Budget; currency: string; month?: string }>()
const emit = defineEmits<{ edit: []; remove: [] }>()
const { find } = useCategories()
const { format } = useMoney()
const category = computed(() => find(props.budget.categoryId))
const available = computed(() => props.budget.availableMinor ?? props.budget.amountMinor)
const share = computed(() => (available.value > 0 ? props.budget.spentMinor / available.value : 0))
const state = computed(() => (share.value > 1 ? "over" : share.value >= 0.85 ? "close" : "ok"))
const left = computed(() => available.value - props.budget.spentMinor)
const transactionsLink = computed(() => {
  const month = props.month ?? currentMonth()
  return { path: "/transactions", query: { category: props.budget.categoryId, from: `${month}-01`, to: addDays(`${addMonths(month, 1)}-01`, -1) } }
})
const items = [
  [
    { get label() { return translate('editBudget') }, icon: "i-lucide-pencil", onSelect: () => emit("edit") },
    { get label() { return translate('deleteBudget') }, icon: "i-lucide-trash-2", color: "error" as const, onSelect: () => emit("remove") },
  ],
]
</script>

<template>
  <li class="group flex items-center gap-3 py-3.5">
    <CategoryIcon :icon="category?.icon" :color="category?.color" />
    <div class="min-w-0 flex-1">
      <div class="flex items-baseline justify-between gap-3">
        <ULink
          :to="transactionsLink"
          class="min-w-0 cursor-pointer truncate rounded-sm text-left text-sm font-medium text-highlighted hover:underline focus-visible:outline-2 focus-visible:outline-primary"
          :title="category?.name"
        >
          {{ category?.name ?? $t('deletedCategory') }}
        </ULink>
        <p class="shrink-0 text-sm text-muted">
          <span class="money text-highlighted">{{ format(budget.spentMinor, currency) }}</span>
          <span class="hidden sm:inline"> {{ $t('of') }} </span><span class="sm:hidden"> / </span>
          <span class="money">{{ format(available, currency, { compact: true }) }}</span>
        </p>
      </div>
      <UProgress
        class="mt-2"
        size="sm"
        :model-value="Math.min(100, Math.round(share * 100))"
        :max="100"
        :color="state === 'over' ? 'error' : state === 'close' ? 'warning' : 'primary'"
        :aria-label="$t('budgetSpent', { name: category?.name ?? $t('budget'), percent: formatPercent(share) })"
      />
      <p
        class="mt-1.5 flex items-center gap-1 text-xs tabular-nums"
        :class="state === 'ok' ? 'text-muted' : 'font-medium text-highlighted'"
      >
        <UIcon v-if="state === 'over'" name="i-lucide-circle-alert" class="size-3.5 text-error" />
        <UIcon v-else-if="state === 'close'" name="i-lucide-triangle-alert" class="size-3.5 text-warning" />
        <template v-if="left >= 0">{{ $t('left', { value1: format(left, currency), value2: Math.round(share * 100) }) }}</template>
        <template v-else>{{ $t('over', { value1: format(-left, currency), value2: Math.round(share * 100) }) }}</template>
      </p>
      <p v-if="budget.carryEnabled" class="mt-1 text-xs text-muted">
        {{ $t('budgetCarryBreakdown', { monthly: format(budget.amountMinor, currency), carried: format(budget.carriedMinor ?? 0, currency) }) }}
        <span v-if="budget.carryStartMonth"> · {{ $t('budgetCarrySince', { month: formatMonth(budget.carryStartMonth) }) }}</span>
      </p>
      <p v-if="budget.projectedSpendMinor != null" class="mt-1 text-xs text-muted">
        {{ $t('budgetPaceProjection', { amount: format(budget.projectedSpendMinor, currency) }) }}
      </p>
      <p v-if="budget.nextChangeMonth" class="mt-1 text-xs text-muted">{{ $t('budgetNextScheduledChange', { month: formatMonth(budget.nextChangeMonth) }) }}</p>
    </div>
    <UDropdownMenu :items="items" :content="{ align: 'end' }">
      <UButton
        icon="i-lucide-ellipsis"
        color="neutral"
        variant="ghost"
        size="sm"
        class="size-10 justify-center sm:size-8"
        :aria-label="$t('actionsFor', { value1: category?.name ?? $t('budget') })"
      />
    </UDropdownMenu>
  </li>
</template>
