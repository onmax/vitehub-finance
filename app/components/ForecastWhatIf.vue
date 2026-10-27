<script setup lang="ts">
import type { Forecast } from "#shared/api"
import { isBaseline, NO_SCENARIO, type ForecastScenario } from "#shared/forecast"
import { parseAmount, toMinor } from "#shared/money"

// What-ifs that rerun the forecast in the browser as they change: a one-off purchase on a day ("can we afford it?"),
// income up or down, and payments left out (a cancelled subscription, an income that stops). The chart, the numbers
// above it, and the months below all follow.
const props = defineProps<{
  forecast: Forecast
  result: { lowest: { date: string; balanceMinor: number; lowMinor: number }; riskDate: string | null }
}>()
const scenario = defineModel<ForecastScenario>({ required: true })
const { format } = useMoney()
const money = (minor: number, signed = false) => format(minor, props.forecast.currency, { signed })
const lastDay = computed(() => props.forecast.days.at(-1)?.date ?? props.forecast.today)

// The one-off: typed text, parsed as people write amounts ("1.200,50").
const amount = ref("")
const date = ref(props.forecast.today)
const parsed = computed(() => (amount.value.trim() ? parseAmount(amount.value) : null))
const invalid = computed(() => amount.value.trim() !== "" && (parsed.value === null || parsed.value <= 0))
watch([parsed, date], () => {
  const value = parsed.value
  const oneOff = value && value > 0 && date.value ? { date: date.value, amountMinor: toMinor(value, props.forecast.currency) } : null
  scenario.value = { ...scenario.value, oneOff }
})

const income = computed({
  get: () => Math.round(scenario.value.incomeChange * 100),
  set: (value: number) => (scenario.value = { ...scenario.value, incomeChange: value / 100 }),
})
const hasIncome = computed(() => props.forecast.series.some((entry) => entry.kind === "income"))

// Series to leave out: incomes first, then the dearest bills.
const perMonth = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 } as const
const choices = computed(() =>
  props.forecast.series
    .filter((entry) => entry.kind !== "transfer")
    .map((entry) => ({ ...entry, monthlyMinor: Math.round(entry.amountMinor * perMonth[entry.cadence]) }))
    .sort((a, b) => Number(b.kind === "income") - Number(a.kind === "income") || Math.abs(b.monthlyMinor) - Math.abs(a.monthlyMinor)),
)
const showAll = ref(false)
const LIMIT = 6
const shown = computed(() => (showAll.value ? choices.value : choices.value.slice(0, LIMIT)))
const counted = (id: string) => !scenario.value.skip.includes(id)
function toggle(id: string, value: boolean | "indeterminate") {
  const skip = new Set(scenario.value.skip)
  if (value === true) skip.delete(id)
  else skip.add(id)
  scenario.value = { ...scenario.value, skip: [...skip] }
}
const cadenceWord = { get weekly() { return translate('aWeek') }, get monthly() { return translate('aMonth') }, get quarterly() { return translate('aQuarter') }, get yearly() { return translate('aYear') } } as const

function reset() {
  amount.value = ""
  date.value = props.forecast.today
  scenario.value = { ...NO_SCENARIO }
}
const active = computed(() => !isBaseline(scenario.value))
const answer = computed(() => {
  if (!scenario.value.oneOff) return null
  const { lowest, riskDate } = props.result
  if (lowest.balanceMinor < 0) return { ok: false, get title() { return translate('notWithoutGoingBelowZero') }, text: translate('theBalanceWouldFallToOnALaterDayOr', { value1: money(lowest.balanceMinor), value2: forecastDay(lowest.date, props.forecast.today) }) }
  if (riskDate) return { ok: false, get title() { return translate('onlyJust') }, text: translate('theLowestExpectedBalanceIsOnButAMonthOf', { value1: money(lowest.balanceMinor), value2: forecastDay(lowest.date, props.forecast.today), value3: forecastDay(riskDate, props.forecast.today) }) }
  return { ok: true, get title() { return translate('yesTheBalanceStaysAboveZero') }, text: translate('theLowestExpectedBalanceWouldBeOnAndInA', { value1: money(lowest.balanceMinor), value2: forecastDay(lowest.date, props.forecast.today), value3: money(lowest.lowMinor) }) }
})
</script>

<template>
  <SectionCard :title="$t('whatIf3')" body-class="gap-5">
    <template #action>
      <UButton v-if="active" :label="$t('reset')" icon="i-lucide-rotate-ccw" color="neutral" variant="link" size="sm" class="-me-1.5 text-muted" @click="reset" />
    </template>
    <p class="-my-1 text-sm text-muted">{{ $t('tryAChangeAndTheChartUpdates') }}</p>

    <fieldset class="flex flex-col gap-3">
      <legend class="mb-2 text-sm font-medium text-highlighted">{{ $t('canWeAffordIt') }}</legend>
      <div class="grid grid-cols-2 gap-3">
        <UFormField :label="$t('oneOffAmount')" :error="invalid ? $t('enterAnAmountAboveZeroLike1200') : undefined">
          <UInput v-model="amount" inputmode="decimal" :placeholder="$t('amountPurchasePlaceholder')" class="w-full" :ui="{ base: 'tabular-nums' }" aria-describedby="whatif-answer" />
        </UFormField>
        <UFormField :label="$t('on')">
          <DateInput v-model="date" :min="forecast.today" :max="lastDay" class="w-full" />
        </UFormField>
      </div>
      <div id="whatif-answer" aria-live="polite">
        <div
          v-if="answer"
          class="flex gap-2.5 rounded-lg p-3 text-sm"
          :class="answer.ok ? 'bg-success/8 dark:bg-success/10' : 'bg-warning/8 dark:bg-warning/10'"
        >
          <UIcon
            :name="answer.ok ? 'i-lucide-circle-check' : 'i-lucide-triangle-alert'"
            class="mt-0.5 size-4 shrink-0"
            :class="answer.ok ? 'text-success' : 'text-warning'"
          />
          <div>
            <p class="font-medium text-highlighted">{{ answer.title }}</p>
            <p class="mt-0.5 text-muted">{{ answer.text }}</p>
          </div>
        </div>
      </div>
    </fieldset>

    <fieldset v-if="hasIncome" class="flex flex-col gap-2">
      <legend class="mb-1 flex w-full items-center justify-between text-sm font-medium text-highlighted"> {{ $t('income') }} <span class="money text-sm font-normal text-muted">{{ income === 0 ? $t('asUsual') : formatPercent(income / 100, { signed: true }) }}</span>
      </legend>
      <USlider v-model="income" :min="-50" :max="30" :step="5" :aria-label="$t('changeEveryIncomeByAPercentage')" />
      <div class="flex justify-between text-[11px] text-muted tabular-nums" aria-hidden="true"><span>{{ formatPercent(-0.5, { signed: true }) }}</span><span>{{ formatPercent(0.3, { signed: true }) }}</span></div>
    </fieldset>

    <fieldset v-if="choices.length" class="flex flex-col">
      <legend class="mb-2 text-sm font-medium text-highlighted">{{ $t('countedPayments') }}</legend>
      <p class="-mt-1 mb-2 text-xs text-muted">{{ $t('untickAPaymentToSeeTheForecastWithoutItLike') }}</p>
      <ul class="flex flex-col">
        <li v-for="entry in shown" :key="entry.id" class="flex min-h-10 items-center gap-3">
          <UCheckbox
            :model-value="counted(entry.id)"
            :label="entry.name"
            class="min-w-0 flex-1"
            :ui="{ label: ['truncate', counted(entry.id) ? 'text-default' : 'text-muted line-through'] }"
            @update:model-value="toggle(entry.id, $event)"
          />
          <span class="money shrink-0 text-xs" :class="entry.kind === 'income' ? FLOW.income.text : 'text-muted'">
            {{ money(entry.amountMinor, true) }} {{ cadenceWord[entry.cadence] }}
          </span>
        </li>
      </ul>
      <UButton
        v-if="choices.length > LIMIT"
        :label="showAll ? $t('showFewer') : $t('showAll', { value1: choices.length })"
        color="neutral"
        variant="link"
        size="sm"
        class="self-start px-0"
        @click="showAll = !showAll"
      />
    </fieldset>
  </SectionCard>
</template>
