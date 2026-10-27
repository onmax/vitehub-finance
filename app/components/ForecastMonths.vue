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
  <SectionCard :title="$t('monthByMonth')" body-class="gap-4">
    <template #action>
      <UButton
        :label="table ? $t('showAsChart') : $t('showAsTable')"
        :icon="table ? 'i-lucide-chart-column' : 'i-lucide-table'"
        color="neutral"
        variant="link"
        size="sm"
        class="-me-1.5 text-muted"
        @click="table = !table"
      />
    </template>
    <p class="-mt-1 text-sm text-muted">{{ $t('whatComesInWhatGoesOutAndWhatSLeft') }}</p>

    <div v-if="!table" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8">
      <div class="flex min-w-0 flex-col gap-3">
        <ForecastMonthsChart v-model="selected" :months="months" :today="today" :format="compact" />
        <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" :aria-label="$t('legend')">
          <li v-for="item in legend" :key="item.name" class="flex items-center gap-1.5">
            <span class="size-2 rounded-xs" :class="item.bg" aria-hidden="true" />{{ item.name }}
          </li>
          <li class="flex items-center gap-1.5"><span class="h-0.5 w-3 rounded-full bg-(--chart-line)" aria-hidden="true" />{{ $t('leftOver2') }}</li>
        </ul>
      </div>
      <ForecastMonthExplain :month="month" :today="today" :currency="currency" :payments="payments" :series="series" class="border-t border-default pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8" />
    </div>

    <div v-else class="overflow-x-auto">
      <table class="w-full min-w-[44rem] table-fixed text-sm">
        <caption class="sr-only">{{ $t('expectedIncomeBillsSpendingMovesAndBalanceByMonth') }}</caption>
        <thead>
          <tr class="text-xs text-muted">
            <th scope="col" class="py-2.5 pe-2 text-left font-medium">{{ $t('month') }}</th>
            <th scope="col" class="px-2 py-2.5 text-right font-medium">{{ $t('income') }}</th>
            <th scope="col" class="px-2 py-2.5 text-right font-medium">{{ $t('bills') }}</th>
            <th scope="col" class="px-2 py-2.5 text-right font-medium">{{ $t('usualSpending') }}</th>
            <th scope="col" class="px-2 py-2.5 text-right font-medium">{{ $t('movedOut') }}</th>
            <th scope="col" class="px-2 py-2.5 text-right font-medium">{{ $t('leftOver2') }}</th>
            <th scope="col" class="py-2.5 ps-2 text-right font-medium">{{ $t('balanceAtTheEnd') }}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default border-t border-default">
          <tr v-for="entry in months" :key="entry.month">
            <th scope="row" class="py-2.5 pe-2 text-left font-normal whitespace-nowrap text-default">{{ formatMonth(entry.month, "short") }}</th>
            <td class="px-2 py-2.5 text-right"><Money :minor="entry.incomeMinor" :currency="currency" tone="in" original="below" /></td>
            <td class="px-2 py-2.5 text-right"><Money :minor="-entry.billsMinor" :currency="currency" original="below" /></td>
            <td class="px-2 py-2.5 text-right"><Money :minor="-entry.variableOutMinor - entry.oneOffMinor" :currency="currency" original="below" /></td>
            <td class="px-2 py-2.5 text-right"><Money :minor="-entry.movedOutMinor" :currency="currency" original="below" /></td>
            <td class="px-2 py-2.5 text-right"><Money :minor="entry.netMinor" :currency="currency" signed tone="in" original="below" /></td>
            <td class="py-2.5 ps-2 text-right">
              <span class="block font-medium text-highlighted"><Money :minor="entry.balanceMinor" :currency="currency" original="below" /></span>
              <span class="block text-xs text-muted tabular-nums">{{ $t('to2', { value1: compact(entry.lowMinor), value2: compact(entry.highMinor) }) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </SectionCard>
</template>
