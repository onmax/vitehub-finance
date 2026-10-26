<script setup lang="ts">
import type { Budget } from "#shared/api"

// A category's budget for the month: how much is spent, a bar that turns amber past 85% and red past 100%, and what's
// left or over in words (color never says it alone).
const props = defineProps<{ budget: Budget; currency: string }>()
const emit = defineEmits<{ edit: []; remove: [] }>()
const { find } = useCategories()
const { format } = useMoney()
const category = computed(() => find(props.budget.categoryId))
const share = computed(() => (props.budget.amountMinor > 0 ? props.budget.spentMinor / props.budget.amountMinor : 0))
const state = computed(() => (share.value > 1 ? "over" : share.value >= 0.85 ? "close" : "ok"))
const left = computed(() => props.budget.amountMinor - props.budget.spentMinor)
const items = [
  [
    { label: "Edit budget", icon: "i-lucide-pencil", onSelect: () => emit("edit") },
    { label: "Delete budget", icon: "i-lucide-trash-2", color: "error" as const, onSelect: () => emit("remove") },
  ],
]
</script>

<template>
  <li class="group flex items-center gap-3 px-4 py-3 sm:px-5">
    <CategoryIcon :icon="category?.icon" :color="category?.color" />
    <div class="min-w-0 flex-1">
      <div class="flex items-baseline justify-between gap-3">
        <button
          type="button"
          class="min-w-0 cursor-pointer truncate rounded-sm text-left text-sm font-medium text-highlighted hover:underline focus-visible:outline-2 focus-visible:outline-primary"
          :title="category?.name"
          @click="emit('edit')"
        >
          {{ category?.name ?? "Deleted category" }}
        </button>
        <p class="shrink-0 text-sm text-muted">
          <span class="money text-highlighted">{{ format(budget.spentMinor, currency) }}</span>
          <span class="hidden sm:inline"> of </span><span class="sm:hidden"> / </span>
          <span class="money">{{ format(budget.amountMinor, currency, { compact: true }) }}</span>
        </p>
      </div>
      <UProgress
        class="mt-2"
        size="sm"
        :model-value="Math.min(100, Math.round(share * 100))"
        :max="100"
        :color="state === 'over' ? 'error' : state === 'close' ? 'warning' : 'primary'"
        :aria-label="`${category?.name ?? 'Budget'}: ${Math.round(share * 100)}% spent`"
      />
      <p
        class="mt-1.5 flex items-center gap-1 text-xs tabular-nums"
        :class="state === 'ok' ? 'text-muted' : 'font-medium text-highlighted'"
      >
        <UIcon v-if="state === 'over'" name="i-lucide-circle-alert" class="size-3.5 text-error" />
        <UIcon v-else-if="state === 'close'" name="i-lucide-triangle-alert" class="size-3.5 text-warning" />
        <template v-if="left >= 0">{{ format(left, currency) }} left · {{ Math.round(share * 100) }}%</template>
        <template v-else>{{ format(-left, currency) }} over · {{ Math.round(share * 100) }}%</template>
      </p>
    </div>
    <UDropdownMenu :items="items" :content="{ align: 'end' }">
      <UButton
        icon="i-lucide-ellipsis"
        color="neutral"
        variant="ghost"
        size="sm"
        class="size-10 justify-center sm:size-8"
        :aria-label="`Actions for ${category?.name ?? 'budget'}`"
      />
    </UDropdownMenu>
  </li>
</template>
