<script setup lang="ts">
import type { Recurring } from "#shared/api"

// Recurring payments by when they next happen ("Next 7 days", "Later this month", "November"…), each with its
// amount, what it was before a change, its cadence and account, and confirm or dismiss for detected ones.
const props = defineProps<{ items: Recurring[]; highlighted: string[]; shared?: boolean; pending: string[] }>()
const emit = defineEmits<{ status: [item: Recurring, status: Recurring["status"]] }>()
const { find } = useCategories()

const CADENCE = { weekly: "Weekly", monthly: "Monthly", quarterly: "Every 3 months", yearly: "Yearly" } as const

const groups = computed(() => {
  const month = currentMonth()
  const order: string[] = []
  const map = new Map<string, Recurring[]>()
  const sorted = [...props.items].sort((a, b) => a.nextDate.localeCompare(b.nextDate))
  for (const item of sorted) {
    const days = daysFromToday(item.nextDate)
    const label =
      days < 0
        ? "Overdue"
        : days <= 7
          ? "Next 7 days"
          : item.nextDate.startsWith(month)
            ? "Later this month"
            : formatMonth(item.nextDate.slice(0, 7))
    if (!map.has(label)) order.push(label)
    map.set(label, [...(map.get(label) ?? []), item])
  }
  return order.map((label) => ({ label, items: map.get(label)! }))
})

function when(item: Recurring) {
  const days = daysFromToday(item.nextDate)
  if (days < 0) return `Expected ${formatDay(item.nextDate)}`
  if (days <= 1) return formatDay(item.nextDate)
  if (days <= 45) return `In ${days} days`
  return formatDay(item.nextDate)
}
const changed = (item: Recurring) => item.previousAmountMinor !== null && item.previousAmountMinor !== item.amountMinor
</script>

<template>
  <div class="flex flex-col gap-8">
    <section v-for="group in groups" :key="group.label" :aria-label="group.label">
      <h3 class="border-b border-default pb-2 text-xs font-medium text-muted">{{ group.label }}</h3>
      <ul class="divide-y divide-default">
        <li
          v-for="item in group.items"
          :id="`recurring-${item.id}`"
          :key="item.id"
          class="flex scroll-mt-24 items-center gap-3 py-3 transition-[background-color] duration-200"
          :class="highlighted.includes(item.id) && 'bg-primary/8'"
        >
          <div class="hidden w-12 shrink-0 flex-col items-center rounded-md bg-elevated py-1 sm:flex" aria-hidden="true">
            <span class="text-[11px] text-muted">{{ formatMonth(item.nextDate.slice(0, 7), "short").slice(0, 3) }}</span>
            <span class="money text-base leading-tight font-semibold text-highlighted">{{ Number(item.nextDate.slice(8)) }}</span>
          </div>
          <CategoryIcon v-if="find(item.categoryId)" :icon="find(item.categoryId)?.icon" :color="find(item.categoryId)?.color" />
          <Monogram v-else :name="item.name" />
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-2">
              <span class="truncate text-sm font-medium text-highlighted" :title="item.name">{{ item.name }}</span>
              <UBadge v-if="item.status === 'detected'" color="neutral" variant="outline" size="sm" label="Detected" class="hidden shrink-0 sm:inline-flex" />
            </p>
            <p class="flex min-w-0 items-center gap-1.5 text-xs text-muted">
              <span class="money truncate">{{ when(item) }}</span>
              <span aria-hidden="true" class="hidden sm:inline">·</span>
              <span class="hidden shrink-0 sm:inline">{{ CADENCE[item.cadence] }}</span>
              <span aria-hidden="true" class="hidden sm:inline">·</span>
              <span class="hidden truncate sm:inline" :title="item.accountName">{{ item.accountName }}</span>
              <span v-if="shared" class="hidden truncate md:inline">({{ item.ownerName }})</span>
            </p>
          </div>
          <div class="flex shrink-0 flex-col items-end">
            <Money :minor="item.amountMinor" :currency="item.currency" tone="in" class="text-sm font-medium" :class="item.amountMinor < 0 && 'text-highlighted'" />
            <p v-if="changed(item)" class="flex items-center gap-1 text-xs text-muted">
              <UIcon
                :name="Math.abs(item.amountMinor) > Math.abs(item.previousAmountMinor!) ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'"
                class="size-3"
              />
              <span><span class="max-sm:hidden">was </span><Money :minor="item.previousAmountMinor!" :currency="item.currency" class="line-through" /></span>
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-0.5">
            <template v-if="item.status === 'detected'">
              <UTooltip text="Confirm it repeats">
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-check"
                  :aria-label="`Confirm ${item.name} repeats`"
                  :loading="pending.includes(item.id)"
                  class="size-10 justify-center max-sm:size-11"
                  @click="emit('status', item, 'confirmed')"
                />
              </UTooltip>
              <UTooltip text="Not recurring">
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-x"
                  :aria-label="`${item.name} isn’t recurring`"
                  :disabled="pending.includes(item.id)"
                  class="size-10 justify-center max-sm:size-11"
                  @click="emit('status', item, 'dismissed')"
                />
              </UTooltip>
            </template>
            <UDropdownMenu
              v-else
              :items="[[{ label: 'Not recurring', icon: 'i-lucide-x', onSelect: () => emit('status', item, 'dismissed') }]]"
              :content="{ align: 'end' }"
            >
              <UButton color="neutral" variant="ghost" icon="i-lucide-ellipsis" :aria-label="`More for ${item.name}`" class="size-10 justify-center max-sm:size-11" :loading="pending.includes(item.id)" />
            </UDropdownMenu>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
