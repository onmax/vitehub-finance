<script setup lang="ts">
import type { Overview } from "#shared/api"

// Recurring payments and income due in the next 14 days, soonest first.
const props = defineProps<{ overview: Overview }>()
const items = computed(() =>
  props.overview.upcoming
    .filter((item) => item.status !== "dismissed" && daysFromToday(item.nextDate) <= 14)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .slice(0, 6),
)
const day = (date: string) => parseDay(date)
const monthShort = (date: string) => new Intl.DateTimeFormat(undefined, { month: "short" }).format(day(date))
const when = (date: string) => {
  const offset = daysFromToday(date)
  if (offset < 0) return "Due"
  if (offset === 0) return "Today"
  if (offset === 1) return "Tomorrow"
  return `In ${offset} days`
}
</script>

<template>
  <SectionCard title="Coming up" to="/recurring" link-label="Recurring">
    <p v-if="items.length === 0" class="py-6 text-center text-sm text-muted">Nothing due in the next two weeks.</p>
    <ul v-else class="flex flex-col divide-y divide-default">
      <li v-for="item in items" :key="item.id" class="flex min-h-12 items-center gap-3 py-2">
        <span class="flex size-10 shrink-0 flex-col items-center justify-center rounded-md border border-default leading-none" aria-hidden="true">
          <span class="text-[10px] font-medium text-muted uppercase">{{ monthShort(item.nextDate) }}</span>
          <span class="money mt-0.5 text-sm font-semibold text-highlighted">{{ day(item.nextDate).getDate() }}</span>
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm text-highlighted" :title="item.name">{{ item.name }}</span>
          <span class="block truncate text-xs text-muted">{{ when(item.nextDate) }} · {{ item.accountName }}</span>
        </span>
        <Money :minor="item.amountMinor" :currency="item.currency" tone="in" class="text-sm text-highlighted" />
      </li>
    </ul>
  </SectionCard>
</template>
