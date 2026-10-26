<script setup lang="ts">
import type { Forecast } from "#shared/api"

// The projection month by month: stacked bars (recurring income up; recurring payments and variable spending down)
// and the same numbers as a table, which doubles as the chart's text equivalent.
const props = defineProps<{ forecast: Forecast }>()
const { format } = useMoney()
const money = (minor: number) => format(minor, props.forecast.currency, { compact: true })
const { locale } = useMoney()
// "Oct", "Nov", "Dec", "Jan 27": the year only where it turns, so twelve labels fit under the bars.
function barLabel(month: string, index: number) {
  const date = parseDay(`${month}-01`)
  const name = new Intl.DateTimeFormat(locale, { month: "short" }).format(date)
  const turns = date.getMonth() === 0 || (index === 0 && date.getFullYear() !== new Date().getFullYear())
  return turns ? `${name} ${String(date.getFullYear()).slice(2)}` : name
}
const bars = computed(() =>
  props.forecast.months.map((entry, index) => ({
    label: barLabel(entry.month, index),
    segments: [
      { name: "Recurring income", value: entry.recurringInMinor, color: "var(--color-money-in)" },
      { name: "Recurring payments", value: entry.recurringOutMinor ? -entry.recurringOutMinor : 0, color: "var(--color-chart-1)" },
      { name: "Variable spending", value: entry.variableOutMinor ? -entry.variableOutMinor : 0, color: "var(--ui-color-neutral-400)" },
    ],
  })),
)
</script>

<template>
  <section aria-labelledby="breakdown-title" class="min-w-0 rounded-xl border border-default bg-default shadow-xs">
    <div class="p-4 sm:p-5">
      <h2 id="breakdown-title" class="text-sm font-medium text-highlighted">Month by month</h2>
      <p class="mt-1 text-sm text-muted">What comes in and goes out each month, and the balance it leaves.</p>
      <BarChart class="mt-4" :bars="bars" :format="money" label="Projected income and spending by month" :height="220" />
    </div>
    <div class="overflow-x-auto border-t border-default">
      <table class="w-full min-w-[34rem] text-sm">
        <caption class="sr-only">Projected income, payments, spending, and balance by month</caption>
        <thead>
          <tr class="text-xs text-muted">
            <th scope="col" class="px-4 py-2.5 text-left font-medium sm:px-5">Month</th>
            <th scope="col" class="px-3 py-2.5 text-right font-medium">Recurring income</th>
            <th scope="col" class="px-3 py-2.5 text-right font-medium">Recurring payments</th>
            <th scope="col" class="px-3 py-2.5 text-right font-medium">Variable spending</th>
            <th scope="col" class="px-4 py-2.5 text-right font-medium sm:px-5">Balance</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default border-t border-default">
          <tr v-for="entry in forecast.months" :key="entry.month">
            <th scope="row" class="px-4 py-2.5 text-left font-normal whitespace-nowrap text-default sm:px-5">{{ formatMonth(entry.month, "short") }}</th>
            <td class="px-3 py-2.5 text-right">
              <Money :minor="entry.recurringInMinor" :currency="forecast.currency" tone="in" />
            </td>
            <td class="px-3 py-2.5 text-right"><Money :minor="entry.recurringOutMinor ? -entry.recurringOutMinor : 0" :currency="forecast.currency" /></td>
            <td class="px-3 py-2.5 text-right"><Money :minor="entry.variableOutMinor ? -entry.variableOutMinor : 0" :currency="forecast.currency" /></td>
            <td class="px-4 py-2.5 text-right font-medium text-highlighted sm:px-5">
              <Money :minor="entry.balanceMinor" :currency="forecast.currency" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
