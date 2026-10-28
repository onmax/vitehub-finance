<script setup lang="ts">
import type { Forecast } from "#shared/api"
import type { PlanningForecast } from "#shared/planning"
import { applyScenario, dailyShare, isBaseline } from "#shared/forecast"

// Where the money is heading: the balance day by day from the actual one, with a likely range, the lowest point, the
// payments coming in and going out, what-ifs that rerun it in the browser, month by month, and account by account.
useHead({ get title() { return translate('forecast') } })
const route = useRoute()
const router = useRouter()
const OPTIONS = [
  { value: 3, get label() { return translate("monthsCount", { count: 3 }, 3) } },
  { value: 6, get label() { return translate("monthsCount", { count: 6 }, 6) } },
  { value: 12, get label() { return translate("monthsCount", { count: 12 }, 12) } },
]
const months = computed<number>({
  get: () => {
    const value = Number(route.query.months)
    return OPTIONS.some((option) => option.value === value) ? value : 6
  },
  set: (value) => void router.replace({ query: { ...route.query, months: value === 6 ? undefined : String(value) } }),
})

const { data: forecast, status, error, refresh } = useScopedFetch<PlanningForecast | null>("/api/forecast", {
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

const { scenario, plans, active, owned, busy, failure, select, save, remove } = useForecastPlans()
const compareId = shallowRef('')
const comparison = computed(() => {
  const plan = plans.value.find(plan => plan.id === compareId.value)
  if (!forecast.value || !plan) return null
  const projection = applyScenario(forecast.value, plan.scenario)
  return { endMinor: projection.days.at(-1)?.balanceMinor ?? 0, lowestMinor: projection.lowest.balanceMinor, days: projection.days, name: plan.name }
})
const { data: me } = useMe()
watch([forecast, me], ([value]) => {
  if (value?.accounts.length && !scenario.value.accountId) scenario.value = { ...scenario.value, accountId: (value.accounts.find(account => account.kind !== 'credit') ?? value.accounts[0])!.id }
}, { immediate: true })
const whatIf = computed(() => !isBaseline(scenario.value))
const view = computed(() => {
  if (!forecast.value) return null
  const result = applyScenario(forecast.value, scenario.value)
  return { ...result, series: result.series.map(entry => entry.id === 'plan:purchase' ? { ...entry, name: translate('oneOffWhatIf') } : entry) }
})

const series = computed(() => new Map((view.value?.series ?? []).map((entry) => [entry.id, entry])))
const chartPayments = computed(() =>
  (view.value?.payments ?? []).map((payment) => {
    const entry = series.value.get(payment.seriesId)
    return { date: payment.date, amountMinor: payment.amountMinor, name: entry?.name ?? "", kind: entry?.kind ?? ("bill" as const) }
  }),
)
const usualOn = (date: string) => (forecast.value ? dailyShare((view.value?.variableMonthlyMinor ?? forecast.value.variableMonthlyMinor) + forecast.value.movedMonthlyMinor, date) : 0)

/** In and out over the 30 days after today: payments plus the usual spending and moves. */
function next30(days: Forecast["days"], payments: Forecast["payments"], variableMonthlyMinor?: number) {
  const value = forecast.value!
  const end = days[Math.min(30, days.length - 1)]?.date ?? value.today
  let inMinor = 0
  let outMinor = 0
  for (const payment of payments) {
    if (payment.date > end || series.value.get(payment.seriesId)?.kind === "transfer") continue
    if (payment.amountMinor > 0) inMinor += payment.amountMinor
    else outMinor -= payment.amountMinor
  }
  // Moves between accounts the forecast counts cancel out; the rest is money leaving like spending does.
  const transfers = payments.filter((payment) => payment.date <= end && series.value.get(payment.seriesId)?.kind === "transfer").reduce((sum, payment) => sum - payment.amountMinor, 0)
  for (const day of days) if (day.date > value.today && day.date <= end) outMinor += variableMonthlyMinor === undefined ? usualOn(day.date) : dailyShare(variableMonthlyMinor + value.movedMonthlyMinor, day.date)
  return { inMinor, outMinor: Math.round(outMinor + transfers) }
}
const window30 = computed(() => {
  if (!view.value || !forecast.value) return { inMinor: 0, outMinor: 0 }
  return next30(view.value.days, view.value.payments)
})
const baselineNumbers = computed(() => {
  const value = forecast.value
  if (!value || !whatIf.value) return null
  const plain = next30(value.days, value.payments, value.variableMonthlyMinor)
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
    ? translate('theRangeIsAGuessUntilThereAreThreeWeeks')
    : translate('planningRangeHelp')
})
</script>

<template>
  <UDashboardPanel id="forecast">
    <template #header>
      <PageNavbar :title="$t('forecast')">
        <template #right>
          <div class="hidden sm:block">
            <SegmentedControl v-model="months" :options="OPTIONS" :label="$t('howFarAhead')" size="sm" />
          </div>
        </template>
      </PageNavbar>
      <UDashboardToolbar class="sm:hidden">
        <SegmentedControl v-model="months" :options="OPTIONS" :label="$t('howFarAhead')" size="sm" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-7xl flex-col gap-12">
        <PageError v-if="error" :error="error" :title="$t('theForecastDidnTLoad')" @retry="refresh()" />

        <div v-else-if="!forecast" class="flex flex-col gap-12" aria-busy="true" :aria-label="$t('loadingTheForecast')">
          <div class="grid grid-cols-2 gap-y-6 lg:grid-cols-4 lg:divide-x lg:divide-default">
            <div v-for="index in 4" :key="index" class="px-3 first:ps-0 sm:px-6 lg:first:ps-0">
              <USkeleton class="h-4 w-20" />
              <USkeleton class="mt-2 h-7 w-28" />
              <USkeleton class="mt-2 h-3 w-36" />
            </div>
          </div>
          <div class="grid gap-x-10 gap-y-12 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div class="border-t border-default pt-4">
              <USkeleton class="h-4 w-24" />
              <USkeleton class="mt-6 h-72 w-full" />
            </div>
            <div class="flex flex-col gap-4 border-t border-default pt-4">
              <USkeleton class="h-4 w-16" />
              <USkeleton v-for="index in 4" :key="index" class="h-9 w-full" />
            </div>
          </div>
        </div>

        <div v-else-if="empty" class="relative overflow-hidden border-t border-default">
          <AreaChart
            class="pt-10"
            dimmed
            bare
            :points="[0, 3, 2, 5, 4, 7, 6, 9].map((value, index) => ({ date: `2026-${String(index + 1).padStart(2, '0')}`, value }))"
            :format="String"
            :format-label="() => ''"
            :label="$t('exampleForecast')"
            :height="240"
          />
          <UEmpty
            variant="naked"
            class="absolute inset-0 bg-default/75"
            icon="i-lucide-chart-line"
            :title="$t('noForecastYet')"
            :description="$t('connectAnAccountToSeeWhereYourBalanceIsHeading')"
            :actions="[{ label: $t('connectAnAccount'), icon: 'i-lucide-plug', to: '/connect' }]"
          />
        </div>

        <template v-else-if="view">
          <ForecastPlans :plans="plans" :active="active" :owned="owned" :busy="busy" :failure="failure" :comparison="comparison" :currency="forecast.currency" @select="select" @save="save" @remove="remove" @compare="compareId = $event" />
          <div v-if="view.safety" class="sticky top-0 z-20 -my-6 flex items-center justify-between gap-3 border-y border-default bg-default px-1 py-3 text-sm xl:hidden" aria-live="polite">
            <span class="text-muted">{{ $t('planningAvailableAfterReserve') }}</span>
            <Money :minor="view.safety.availableMinor" :currency="forecast.currency" :class="view.safety.availableMinor < 0 ? 'text-error' : 'text-highlighted'" />
          </div>
          <ForecastSummary
            :forecast="forecast"
            :days="view.days"
            :lowest="view.lowest"
            :risk-date="view.riskDate"
            :next30="window30"
            :baseline="baselineNumbers"
            :class="status === 'pending' && 'opacity-60'"
          />

          <div class="-mt-6 flex flex-col gap-3 empty:hidden">
            <div v-if="lowData" class="flex gap-3 rounded-lg bg-primary/6 p-4 text-sm dark:bg-primary/10">
              <UIcon name="i-lucide-sprout" class="mt-0.5 size-4 shrink-0 text-primary" />
              <p class="text-default"> {{ $t('basedOnOfTransactionsSoTreatItAsARough', { count: formatCount(forecast.dataDays) }, forecast.dataDays) }} </p>
            </div>
            <div v-if="!hasIncome" class="flex gap-3 rounded-lg bg-warning/8 p-4 text-sm dark:bg-warning/10">
              <UIcon name="i-lucide-circle-help" class="mt-0.5 size-4 shrink-0 text-warning" />
              <p class="text-default"> {{ $t('noRegularIncomeFoundYetSoTheForecastOnlyGoes') }} <ULink to="/recurring" class="font-medium text-highlighted underline underline-offset-2">{{ $t('recurring') }}</ULink>.
              </p>
            </div>
          </div>

          <div class="grid gap-x-10 gap-y-12 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <SectionCard :title="$t('balance2')" body-class="gap-3">
              <template #action>
                <UButton
                  :label="table ? $t('showAsChart') : $t('showAsTable')"
                  :icon="table ? 'i-lucide-chart-line' : 'i-lucide-table'"
                  color="neutral"
                  variant="link"
                  size="sm"
                  class="-me-1.5 text-muted"
                  @click="table = !table"
                />
              </template>
              <p class="-mt-1 text-sm text-muted">{{ $t('actualUntilTodayThenExpectedFromYourPaymentsAndUsual') }}</p>
              <template v-if="!table">
                <ForecastBalanceChart
                  class="mt-2 transition-opacity duration-150 motion-reduce:transition-none"
                  :class="status === 'pending' && 'opacity-60'"
                  :today="forecast.today"
                  :history="forecast.history"
                  :days="view.days"
                  :baseline="comparison?.days ?? (whatIf ? forecast.days : null)"
                  :payments="chartPayments"
                  :lowest="view.lowest"
                  :usual-on="usualOn"
                  :format="money"
                  :format-axis="axis"
                  :label="$t('balanceActualAndExpectedForTheNextMonths', { value1: months })"
                />
                <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" :aria-label="$t('legend')">
                  <li class="flex items-center gap-1.5"><span class="h-0.5 w-4 rounded-full bg-(--chart-line)" aria-hidden="true" />{{ $t('actual') }}</li>
                  <li class="flex items-center gap-1.5">
                    <span class="h-0.5 w-4 border-t-2 border-dashed border-primary" aria-hidden="true" />{{ whatIf ? $t('withTheWhatIf') : $t('expected2') }}
                  </li>
                  <li class="flex items-center gap-1.5"><span class="h-2.5 w-4 rounded-xs bg-primary/15" aria-hidden="true" />{{ $t('likelyRange') }}</li>
                  <li v-if="whatIf || comparison" class="flex items-center gap-1.5">
                    <span class="h-0.5 w-4 border-t border-dashed border-(--ui-text-muted)" aria-hidden="true" />{{ comparison?.name ?? $t('withoutIt') }} </li>
                  <li class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-warning" aria-hidden="true" />{{ $t('lowestPoint') }}</li>
                  <li class="flex items-center gap-1.5">
                    <span class="size-2 rounded-full" :class="FLOW.income.bg" aria-hidden="true" /><span class="size-2 rounded-full" :class="FLOW.bills.bg" aria-hidden="true" />{{ $t('paymentsInAndOut') }} </li>
                </ul>
                <p class="text-xs text-muted">{{ rangeNote }}</p>
              </template>
              <div v-else class="max-h-[28rem] overflow-auto">
                <table class="w-full min-w-[36rem] text-sm">
                  <caption class="sr-only">{{ $t('expectedBalanceOnceAWeekWithItsLikelyRangeAnd') }}</caption>
                  <thead class="sticky top-0 bg-default">
                    <tr class="text-xs text-muted">
                      <th scope="col" class="py-2.5 pe-3 text-left font-medium">{{ $t('weekTo') }}</th>
                      <th scope="col" class="px-3 py-2.5 text-right font-medium">{{ $t('expected2') }}</th>
                      <th scope="col" class="px-3 py-2.5 text-right font-medium">{{ $t('likelyRange') }}</th>
                      <th scope="col" class="py-2.5 ps-3 text-left font-medium">{{ $t('paymentsThatWeek') }}</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-default border-t border-default">
                    <tr v-for="week in weeks" :key="week.date">
                      <th scope="row" class="py-2 pe-3 text-left font-normal whitespace-nowrap text-default">{{ forecastDay(week.date, forecast.today) }}</th>
                      <td class="px-3 py-2 text-right font-medium text-highlighted"><Money :minor="week.balanceMinor" :currency="forecast.currency" original="below" /></td>
                      <td class="money px-3 py-2 text-right text-xs text-muted">{{ $t('to2', { value1: axis(week.lowMinor), value2: axis(week.highMinor) }) }}</td>
                      <td class="py-2 ps-3 text-xs text-muted">{{ week.named.join(", ") || "—" }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <ForecastWhatIf
              v-model="scenario"
              :forecast="forecast"
              :result="{ lowest: view.lowest, riskDate: view.riskDate, cashRiskDate: view.cashRiskDate, safety: view.safety, accountSafety: view.accountSafety, unavailableAccounts: view.unavailableAccounts }"
              class="self-start"
            />
          </div>

          <ForecastPlanEvents v-model="scenario" :forecast="forecast" />

          <ForecastUpcoming :today="forecast.today" :currency="forecast.currency" :series="view.series" :payments="view.payments" />

          <ForecastMonths :months="view.months" :today="forecast.today" :currency="forecast.currency" :payments="view.payments" :series="view.series" />

          <ForecastAccounts :accounts="view.accounts" :today="forecast.today" :currency="forecast.currency" />
          <ForecastProvenance :forecast="forecast" />
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
