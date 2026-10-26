<script setup lang="ts">
import type { ForecastMonth, ForecastPayment, ForecastSeries } from "#shared/api"

// Month by month: the bars, the picked month explained step by step beside them, and the same numbers as a table.
const props = defineProps<{ months: ForecastMonth[]; today: string; currency: string; payments: ForecastPayment[]; series: ForecastSeries[] }>()
const { format } = useMoney()
const compact = (minor: number) => format(minor, props.currency, { compact: true })
// The first full month is the most telling; the current one is only what's left of it.
const selected = ref(props.months.length > 1 ? 1 : 0)
watch(
  () => props.months.length,
  (length) => {
    if (selected.value >= length) selected.value = Math.max(0, length - 1)
  },
)
const month = computed(() => props.months[selected.value] ?? props.months[0]!)
const table = ref(false)
const legend = computed(() => {
  const keys: Array<keyof typeof FLOW> = ["income", "bills", "variable"]
  if (props.months.some((entry) => entry.movedOutMinor !== 0)) keys.push("moved")
  if (props.months.some((entry) => entry.oneOffMinor)) keys.push("oneOff")
  return keys.map((key) => FLOW[key])
})
</script>

<template>
  <section aria-labelledby="months-title" class="flex min-w-0 flex-col gap-4">
    <div class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 id="months-title" class="text-base font-semibold text-highlighted">Month by month</h2>
        <p class="mt-0.5 text-sm text-muted">What comes in, what goes out, and what’s left each month.</p>
      </div>
      <UButton
        :label="table ? 'Show as chart' : 'Show as table'"
        :icon="table ? 'i-lucide-chart-column' : 'i-lucide-table'"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="table = !table"
      />
    </div>

    <div v-if="!table" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div class="flex min-w-0 flex-col gap-3">
        <ForecastMonthsChart v-model="selected" :months="months" :today="today" :format="compact" />
        <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
          <li v-for="item in legend" :key="item.name" class="flex items-center gap-1.5">
            <span class="size-2 rounded-xs" :class="item.bg" aria-hidden="true" />{{ item.name }}
          </li>
          <li class="flex items-center gap-1.5"><span class="h-0.5 w-3 rounded-full bg-(--chart-line)" aria-hidden="true" />Left over</li>
        </ul>
      </div>
      <ForecastMonthExplain :month="month" :today="today" :currency="currency" :payments="payments" :series="series" class="rounded-xl bg-muted p-4" />
    </div>

    <div v-else class="overflow-x-auto rounded-xl ring ring-default">
      <table class="w-full min-w-[44rem] text-sm">
        <caption class="sr-only">Expected income, bills, spending, moves, and balance by month</caption>
        <thead>
          <tr class="text-xs text-muted">
            <th scope="col" class="px-4 py-2.5 text-left font-medium">Month</th>
            <th scope="col" class="px-3 py-2.5 text-right font-medium">Income</th>
            <th scope="col" class="px-3 py-2.5 text-right font-medium">Bills</th>
            <th scope="col" class="px-3 py-2.5 text-right font-medium">Usual spending</th>
            <th scope="col" class="px-3 py-2.5 text-right font-medium">Moved out</th>
            <th scope="col" class="px-3 py-2.5 text-right font-medium">Left over</th>
            <th scope="col" class="px-4 py-2.5 text-right font-medium">Balance at the end</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default border-t border-default">
          <tr v-for="entry in months" :key="entry.month">
            <th scope="row" class="px-4 py-2.5 text-left font-normal whitespace-nowrap text-default">{{ formatMonth(entry.month, "short") }}</th>
            <td class="px-3 py-2.5 text-right"><Money :minor="entry.incomeMinor" :currency="currency" tone="in" /></td>
            <td class="px-3 py-2.5 text-right"><Money :minor="-entry.billsMinor" :currency="currency" /></td>
            <td class="px-3 py-2.5 text-right"><Money :minor="-entry.variableOutMinor - entry.oneOffMinor" :currency="currency" /></td>
            <td class="px-3 py-2.5 text-right"><Money :minor="-entry.movedOutMinor" :currency="currency" /></td>
            <td class="px-3 py-2.5 text-right"><Money :minor="entry.netMinor" :currency="currency" signed tone="in" /></td>
            <td class="px-4 py-2.5 text-right">
              <span class="block font-medium text-highlighted"><Money :minor="entry.balanceMinor" :currency="currency" /></span>
              <span class="block text-xs text-muted tabular-nums">{{ compact(entry.lowMinor) }} to {{ compact(entry.highMinor) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
