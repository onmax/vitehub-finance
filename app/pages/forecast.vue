<script setup lang="ts">
import type { Forecast } from "#shared/api"

// Where the money is heading: the projected balance for the next 3, 6, or 12 months from recurring payments and the
// usual variable spending, the monthly breakdown, the savings rate, and "Can we afford it?".
useHead({ title: "Forecast" })
const route = useRoute()
const router = useRouter()
const OPTIONS = [
  { value: 3, label: "3 months" },
  { value: 6, label: "6 months" },
  { value: 12, label: "12 months" },
]
const months = computed<number>({
  get: () => {
    const value = Number(route.query.months)
    return OPTIONS.some((option) => option.value === value) ? value : 6
  },
  set: (value) => void router.replace({ query: { ...route.query, months: value === 6 ? undefined : String(value) } }),
})

const { data: forecast, status, error, refresh } = useScopedFetch<Forecast | null>("/api/forecast", {
  key: "forecast",
  query: () => ({ months: months.value }),
  default: () => null,
})
const { format } = useMoney()

const empty = computed(
  () =>
    forecast.value !== null &&
    forecast.value.startMinor === 0 &&
    forecast.value.averageMonthlyIncomeMinor === 0 &&
    forecast.value.months.every((entry) => entry.recurringOutMinor === 0 && entry.variableOutMinor === 0),
)
const end = computed(() => forecast.value?.months.at(-1) ?? null)
const points = computed(() => {
  if (!forecast.value) return []
  return [
    { date: "now", value: forecast.value.startMinor },
    ...forecast.value.months.map((entry) => ({ date: entry.month, value: entry.balanceMinor })),
  ]
})
const pointLabel = (date: string) => (date === "now" ? "Today" : formatMonth(date, "short"))
const money = (minor: number) => format(minor, forecast.value?.currency, { compact: true })
const savingsRate = computed(() => {
  const value = forecast.value
  if (!value || value.averageMonthlyIncomeMinor <= 0) return null
  return value.monthlySavingsMinor / value.averageMonthlyIncomeMinor
})
const change = computed(() => (forecast.value && end.value ? end.value.balanceMinor - forecast.value.startMinor : 0))
</script>

<template>
  <UDashboardPanel id="forecast">
    <template #header>
      <PageNavbar title="Forecast">
        <template #right>
          <div class="hidden sm:block">
            <SegmentedControl v-model="months" :options="OPTIONS" label="How far ahead" size="sm" />
          </div>
        </template>
      </PageNavbar>
      <UDashboardToolbar class="sm:hidden">
        <SegmentedControl v-model="months" :options="OPTIONS" label="How far ahead" size="sm" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <PageError v-if="error" :error="error" title="The forecast didn’t load" @retry="refresh()" />

      <template v-else-if="!forecast">
        <div class="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div v-for="index in 4" :key="index" class="rounded-xl border border-default p-4">
            <USkeleton class="h-4 w-24" />
            <USkeleton class="mt-2 h-8 w-32" />
            <USkeleton class="mt-2 h-3 w-40" />
          </div>
        </div>
        <div class="rounded-xl border border-default p-5">
          <USkeleton class="h-4 w-36" />
          <USkeleton class="mt-4 h-56 w-full" />
        </div>
      </template>

      <div v-else-if="empty" class="relative overflow-hidden rounded-xl border border-default bg-default">
        <AreaChart
          class="px-4 pt-6"
          dimmed
          bare
          :points="[0, 3, 2, 5, 4, 7, 6, 9].map((value, index) => ({ date: `2026-${String(index + 1).padStart(2, '0')}`, value }))"
          :format="String"
          :format-label="() => ''"
          label="Example forecast"
          :height="240"
        />
        <UEmpty
          class="absolute inset-0 bg-default/80"
          icon="i-lucide-chart-line"
          title="No forecast yet"
          description="Connect an account and Joxi projects your balance from your income, bills, and usual spending."
          :actions="[{ label: 'Connect an account', icon: 'i-lucide-plug', to: '/connect' }]"
        />
      </div>

      <template v-else>
        <div class="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <ForecastStat label="Balance today" :minor="forecast.startMinor" :currency="forecast.currency" note="Across the accounts in net worth" />
          <ForecastStat
            :label="`In ${months} months`"
            :minor="end?.balanceMinor ?? 0"
            :currency="forecast.currency"
            :note="`${format(change, forecast.currency, { signed: true, compact: true })} from today`"
          />
          <ForecastStat
            label="Saved per month"
            :minor="forecast.monthlySavingsMinor"
            :currency="forecast.currency"
            :note="savingsRate === null ? 'No regular income found yet' : `${formatPercent(savingsRate)} of income`"
          />
          <ForecastStat
            label="Variable spending"
            :minor="forecast.variableMonthlyMinor"
            :currency="forecast.currency"
            :note="`Per month, against ${format(forecast.averageMonthlyIncomeMinor, forecast.currency, { compact: true })} income`"
          />
        </div>

        <section aria-labelledby="projection-title" class="rounded-xl border border-default bg-default p-4 shadow-xs sm:p-5">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="projection-title" class="text-sm font-medium text-highlighted">Projected balance</h2>
            <p class="text-xs text-muted" :class="status === 'pending' && 'opacity-60'">
              Recurring payments plus your usual variable spending
            </p>
          </div>
          <AreaChart
            class="mt-4 transition-opacity duration-150"
            :class="status === 'pending' && 'opacity-60'"
            :points="points"
            :format="money"
            :format-label="pointLabel"
            :label="`Projected balance for the next ${months} months`"
            :height="240"
          />
        </section>

        <div class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <ForecastBreakdown :forecast="forecast" />
          <ForecastAfford :forecast="forecast" class="self-start" />
        </div>
      </template>
    </template>
  </UDashboardPanel>
</template>
