<script setup lang="ts">
import type { Forecast } from "#shared/api"
import { applyScenario, dailyShare, isBaseline, NO_SCENARIO, type ForecastScenario } from "#shared/forecast"

// Where the money is heading: the balance day by day from the actual one, with a likely range, the lowest point, the
// payments coming in and going out, what-ifs that rerun it in the browser, month by month, and account by account.
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
const money = (minor: number) => format(minor, forecast.value?.currency)
const axis = (minor: number) => format(minor, forecast.value?.currency, { compact: true })

const empty = computed(
  () =>
    forecast.value !== null &&
    forecast.value.startMinor === 0 &&
    forecast.value.series.length === 0 &&
    forecast.value.variableMonthlyMinor === 0 &&
    forecast.value.dataDays === 0,
)

const scenario = ref<ForecastScenario>({ ...NO_SCENARIO })
const whatIf = computed(() => !isBaseline(scenario.value))
const view = computed(() => (forecast.value ? applyScenario(forecast.value, scenario.value) : null))

const series = computed(() => new Map((forecast.value?.series ?? []).map((entry) => [entry.id, entry])))
const chartPayments = computed(() =>
  (view.value?.payments ?? []).map((payment) => {
    const entry = series.value.get(payment.seriesId)
    return { date: payment.date, amountMinor: payment.amountMinor, name: entry?.name ?? "", kind: entry?.kind ?? ("bill" as const) }
  }),
)
const usualOn = (date: string) => (forecast.value ? dailyShare(forecast.value.variableMonthlyMinor + forecast.value.movedMonthlyMinor, date) : 0)

/** In and out over the 30 days after today: payments plus the usual spending and moves. */
function next30(days: Forecast["days"], payments: Forecast["payments"], oneOff = 0) {
  const value = forecast.value!
  const end = days[Math.min(30, days.length - 1)]?.date ?? value.today
  let inMinor = 0
  let outMinor = oneOff
  for (const payment of payments) {
    if (payment.date > end || series.value.get(payment.seriesId)?.kind === "transfer") continue
    if (payment.amountMinor > 0) inMinor += payment.amountMinor
    else outMinor -= payment.amountMinor
  }
  // Moves between accounts the forecast counts cancel out; the rest is money leaving like spending does.
  const transfers = payments.filter((payment) => payment.date <= end && series.value.get(payment.seriesId)?.kind === "transfer").reduce((sum, payment) => sum - payment.amountMinor, 0)
  for (const day of days) if (day.date > value.today && day.date <= end) outMinor += usualOn(day.date)
  return { inMinor, outMinor: Math.round(outMinor + transfers) }
}
const window30 = computed(() => {
  if (!view.value || !forecast.value) return { inMinor: 0, outMinor: 0 }
  const end = view.value.days[Math.min(30, view.value.days.length - 1)]?.date ?? ""
  const oneOff = scenario.value.oneOff && scenario.value.oneOff.date <= end ? scenario.value.oneOff.amountMinor : 0
  return next30(view.value.days, view.value.payments, oneOff)
})
const baselineNumbers = computed(() => {
  const value = forecast.value
  if (!value || !whatIf.value) return null
  const plain = next30(value.days, value.payments)
  return { end: value.days.at(-1)!.balanceMinor, lowest: value.lowest.balanceMinor, next30: plain.inMinor - plain.outMinor }
})

const hasIncome = computed(() => forecast.value?.series.some((entry) => entry.kind === "income") ?? false)
const lowData = computed(() => (forecast.value ? forecast.value.dataDays > 0 && forecast.value.dataDays < 60 : false))

// The chart's text equivalent: one row a week.
const table = ref(false)
const weeks = computed(() => {
  const value = view.value
  if (!value || !forecast.value) return []
  return value.days
    .filter((_, index) => index % 7 === 0 || index === value.days.length - 1)
    .map((day, index, list) => {
      const from = index ? list[index - 1]!.date : ""
      const named = value.payments
        .filter((payment) => payment.date > from && payment.date <= day.date && series.value.get(payment.seriesId)?.kind !== "transfer")
        .map((payment) => `${series.value.get(payment.seriesId)?.name} ${format(payment.amountMinor, forecast.value!.currency, { signed: true, compact: true })}`)
      return { ...day, named }
    })
})
const rangeNote = computed(() => {
  const value = forecast.value
  if (!value) return ""
  return value.dataDays < 21
    ? "The range is a guess until there are three weeks of transactions."
    : `The shaded range is where the balance lands 8 times in 10, from how much your spending moved week to week over the last ${Math.min(26, Math.floor(value.dataDays / 7))} weeks.`
})
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
      <div class="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <PageError v-if="error" :error="error" title="The forecast didn’t load" @retry="refresh()" />

        <template v-else-if="!forecast">
          <div class="grid grid-cols-2 gap-px overflow-hidden rounded-xl ring ring-default lg:grid-cols-4">
            <div v-for="index in 4" :key="index" class="p-4">
              <USkeleton class="h-3 w-20" />
              <USkeleton class="mt-2 h-7 w-28" />
              <USkeleton class="mt-2 h-3 w-36" />
            </div>
          </div>
          <USkeleton class="h-80 w-full rounded-xl" />
        </template>

        <div v-else-if="empty" class="relative overflow-hidden rounded-xl bg-muted">
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
            class="absolute inset-0 bg-default/70"
            icon="i-lucide-chart-line"
            title="No forecast yet"
            description="Connect an account and ViteHub Finance projects your balance from your income, bills, and usual spending."
            :actions="[{ label: 'Connect an account', icon: 'i-lucide-plug', to: '/connect' }]"
          />
        </div>

        <template v-else-if="view">
          <ForecastSummary
            :forecast="forecast"
            :days="view.days"
            :lowest="view.lowest"
            :risk-date="view.riskDate"
            :next30="window30"
            :baseline="baselineNumbers"
            :class="status === 'pending' && 'opacity-60'"
          />

          <div class="flex flex-col gap-3 empty:hidden">
            <div v-if="lowData" class="flex gap-3 rounded-xl bg-sky-500/10 p-4 text-sm">
              <UIcon name="i-lucide-sprout" class="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400" />
              <p class="text-default">
                Based on {{ forecast.dataDays }} {{ forecast.dataDays === 1 ? "day" : "days" }} of transactions, so treat it as a first sketch.
                Payments count as recurring after the third one; until then they're part of usual spending.
              </p>
            </div>
            <div v-if="!hasIncome" class="flex gap-3 rounded-xl bg-amber-500/10 p-4 text-sm">
              <UIcon name="i-lucide-circle-help" class="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p class="text-default">
                No regular income found yet, so the forecast only goes down. A salary shows up after three payments; you can confirm one sooner on
                <ULink to="/recurring" class="font-medium text-highlighted underline underline-offset-2">Recurring</ULink>.
              </p>
            </div>
          </div>

          <div class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <section aria-labelledby="balance-title" class="flex min-w-0 flex-col gap-3">
              <div class="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 id="balance-title" class="text-base font-semibold text-highlighted">Balance</h2>
                  <p class="mt-0.5 text-sm text-muted">Actual until today, then expected from your payments and usual spending.</p>
                </div>
                <UButton
                  :label="table ? 'Show as chart' : 'Show as table'"
                  :icon="table ? 'i-lucide-chart-line' : 'i-lucide-table'"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  @click="table = !table"
                />
              </div>
              <template v-if="!table">
                <ForecastBalanceChart
                  class="mt-2 transition-opacity duration-150 motion-reduce:transition-none"
                  :class="status === 'pending' && 'opacity-60'"
                  :today="forecast.today"
                  :history="forecast.history"
                  :days="view.days"
                  :baseline="whatIf ? forecast.days : null"
                  :payments="chartPayments"
                  :lowest="view.lowest"
                  :usual-on="usualOn"
                  :format="money"
                  :format-axis="axis"
                  :label="`Balance, actual and expected for the next ${months} months`"
                />
                <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
                  <li class="flex items-center gap-1.5"><span class="h-0.5 w-4 rounded-full bg-(--chart-line)" aria-hidden="true" />Actual</li>
                  <li class="flex items-center gap-1.5">
                    <span class="h-0.5 w-4 border-t-2 border-dashed border-indigo-600 dark:border-indigo-400" aria-hidden="true" />{{ whatIf ? "With the what-if" : "Expected" }}
                  </li>
                  <li class="flex items-center gap-1.5"><span class="h-2.5 w-4 rounded-xs bg-indigo-500/15" aria-hidden="true" />Likely range</li>
                  <li v-if="whatIf" class="flex items-center gap-1.5">
                    <span class="h-0.5 w-4 border-t border-dashed border-(--ui-text-muted)" aria-hidden="true" />Without it
                  </li>
                  <li class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-amber-500" aria-hidden="true" />Lowest point</li>
                  <li class="flex items-center gap-1.5">
                    <span class="size-2 rounded-full" :class="FLOW.income.bg" aria-hidden="true" /><span class="size-2 rounded-full" :class="FLOW.bills.bg" aria-hidden="true" />Payments in and out
                  </li>
                </ul>
                <p class="text-xs text-muted">{{ rangeNote }}</p>
              </template>
              <div v-else class="max-h-[28rem] overflow-auto rounded-xl ring ring-default">
                <table class="w-full min-w-[36rem] text-sm">
                  <caption class="sr-only">Expected balance once a week, with its likely range and the payments in that week</caption>
                  <thead class="sticky top-0 bg-default">
                    <tr class="text-xs text-muted">
                      <th scope="col" class="px-4 py-2.5 text-left font-medium">Week to</th>
                      <th scope="col" class="px-3 py-2.5 text-right font-medium">Expected</th>
                      <th scope="col" class="px-3 py-2.5 text-right font-medium">Likely range</th>
                      <th scope="col" class="px-4 py-2.5 text-left font-medium">Payments that week</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-default border-t border-default">
                    <tr v-for="week in weeks" :key="week.date">
                      <th scope="row" class="px-4 py-2 text-left font-normal whitespace-nowrap text-default">{{ forecastDay(week.date, forecast.today) }}</th>
                      <td class="px-3 py-2 text-right font-medium text-highlighted"><Money :minor="week.balanceMinor" :currency="forecast.currency" /></td>
                      <td class="money px-3 py-2 text-right text-xs text-muted">{{ axis(week.lowMinor) }} to {{ axis(week.highMinor) }}</td>
                      <td class="px-4 py-2 text-xs text-muted">{{ week.named.join(", ") || "—" }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <ForecastWhatIf
              v-model="scenario"
              :forecast="forecast"
              :result="{ lowest: view.lowest, riskDate: view.riskDate }"
              class="self-start"
            />
          </div>

          <ForecastUpcoming :today="forecast.today" :currency="forecast.currency" :series="forecast.series" :payments="view.payments" />

          <ForecastMonths :months="view.months" :today="forecast.today" :currency="forecast.currency" :payments="view.payments" :series="forecast.series" />

          <ForecastAccounts v-if="forecast.accounts.length > 1" :accounts="forecast.accounts" :today="forecast.today" :currency="forecast.currency" />
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
