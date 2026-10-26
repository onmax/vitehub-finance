<script setup lang="ts">
import type { Overview } from "#shared/api"

// This month's spending by category as horizontal bars in each category's color, the largest first.
const props = defineProps<{ overview: Overview }>()
const { format } = useMoney()
const shown = computed(() => props.overview.spending.slice(0, 7))
const max = computed(() => Math.max(1, ...shown.value.map((item) => item.amountMinor)))
const total = computed(() => props.overview.spending.reduce((sum, item) => sum + item.amountMinor, 0))
const monthStart = `${currentMonth()}-01`
const link = (id: string | null) => ({ path: "/transactions", query: { category: id ?? "none", from: monthStart, view: "out" } })
</script>

<template>
  <SectionCard title="Spending by category" to="/budgets" link-label="Budgets">
    <p v-if="shown.length === 0" class="py-6 text-center text-sm text-muted">No spending this month yet.</p>
    <ul v-else class="-mx-2 flex flex-col">
      <li v-for="item in shown" :key="item.categoryId ?? 'none'">
        <NuxtLink
          :to="link(item.categoryId)"
          class="flex min-h-11 items-center gap-3 rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-elevated/60 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <CategoryIcon :icon="item.categoryId ? item.icon : null" :color="item.color" size="sm" />
          <span class="min-w-0 flex-1">
            <span class="flex items-baseline justify-between gap-2 text-sm">
              <span class="truncate text-default">{{ item.name }}</span>
              <span class="money text-highlighted">{{ format(item.amountMinor, overview.currency) }}</span>
            </span>
            <span class="mt-1 block h-1.5 overflow-hidden rounded-full bg-elevated" aria-hidden="true">
              <span class="block h-full rounded-full" :class="categoryColor(item.color).solid" :style="{ width: `${Math.max(2, (item.amountMinor / max) * 100)}%` }" />
            </span>
          </span>
        </NuxtLink>
      </li>
    </ul>
    <p v-if="shown.length" class="mt-auto pt-3 text-xs text-muted">
      <span class="money">{{ format(total, overview.currency) }}</span> spent in {{ overview.spending.length }}
      {{ overview.spending.length === 1 ? "category" : "categories" }}
    </p>
  </SectionCard>
</template>
