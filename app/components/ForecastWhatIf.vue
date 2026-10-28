<script setup lang="ts">
import type { PlanningForecast } from "#shared/planning"
import { isBaseline, NO_SCENARIO, type ForecastScenario } from "#shared/forecast"
import { parseAmount, toMinor, fromMinor } from "#shared/money"

// What-ifs that rerun the forecast in the browser as they change: a one-off purchase on a day ("can we afford it?"),
// income up or down, and payments left out (a cancelled subscription, an income that stops). The chart, the numbers
// above it, and the months below all follow.
const props = defineProps<{
  forecast: PlanningForecast
  result: { lowest: { date: string; balanceMinor: number; lowMinor: number }; riskDate: string | null; cashRiskDate: string | null; safety: { name: string; projectedMinor: number; availableMinor: number; reserveMinor: number; date: string } | null; unavailableAccounts: number; accountSafety: Array<{ name: string; projectedMinor: number; availableMinor: number; reserveMinor: number; date: string }> }
}>()
const scenario = defineModel<ForecastScenario>({ required: true })
const { format } = useMoney()
const money = (minor: number, signed = false) => format(minor, props.forecast.currency, { signed })
const lastDay = computed(() => props.forecast.days.at(-1)?.date ?? props.forecast.today)

// The one-off: typed text, parsed as people write amounts ("1.200,50").
const amount = ref(scenario.value.oneOff ? String(fromMinor(scenario.value.oneOff.amountMinor, props.forecast.currency)) : '')
const date = ref(scenario.value.oneOff?.date ?? props.forecast.today)
watch(() => scenario.value.oneOff, value => {
  const current = parseAmount(amount.value)
  if ((value?.amountMinor ?? 0) !== (current ? toMinor(current, props.forecast.currency) : 0)) amount.value = value ? String(fromMinor(value.amountMinor, props.forecast.currency)) : ''
  if (value) date.value = value.date
})
const parsed = computed(() => (amount.value.trim() ? parseAmount(amount.value) : null))
const invalid = computed(() => amount.value.trim() !== "" && (parsed.value === null || parsed.value <= 0))
watch([parsed, date], () => {
  const value = parsed.value
  const oneOff = value && value > 0 && date.value ? { date: date.value, amountMinor: toMinor(value, props.forecast.currency), accountId: account.value } : null
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
const active = computed(() => !isBaseline(scenario.value) || !!scenario.value.minimumReserveMinor || scenario.value.protectGoals === false)
const account = computed({
  get: () => scenario.value.accountId ?? props.forecast.accounts.find(entry => entry.kind !== 'credit')?.id ?? props.forecast.accounts[0]?.id ?? '',
  set: (value: string) => { scenario.value = { ...scenario.value, accountId: value, oneOff: scenario.value.oneOff ? { ...scenario.value.oneOff, accountId: value } : null } },
})
const payingWithCredit = computed(() => props.forecast.accounts.find(entry => entry.id === account.value)?.kind === 'credit')
const accountOptions = computed(() => props.forecast.accounts.map(entry => ({ value: entry.id, label: entry.name })))
const reserve = computed({
  get: () => String(fromMinor(scenario.value.minimumReserveMinor ?? 0, props.forecast.currency)),
  set: (value: string) => { const parsed = parseAmount(value); if (parsed !== null && parsed >= 0) scenario.value = { ...scenario.value, minimumReserveMinor: toMinor(parsed, props.forecast.currency) } },
})
const protectGoals = computed({ get: () => scenario.value.protectGoals !== false, set: (value: boolean) => { scenario.value = { ...scenario.value, protectGoals: value } } })
const spendingMode = computed({ get: () => scenario.value.spendingMode ?? 'history', set: (value: 'history' | 'budget') => { scenario.value = { ...scenario.value, spendingMode: value } } })
const spendingOptions = computed(() => [{ label: translate('planningHistoricalSpending'), value: 'history' }, ...(props.forecast.planning.budgetMonthlyMinor === null ? [] : [{ label: translate('planningBudgetSpending'), value: 'budget' }])])
const spendingChange = computed({ get: () => Math.round((scenario.value.spendingChange ?? 0) * 100), set: (value: number) => { scenario.value = { ...scenario.value, spendingChange: value / 100 } } })
const answer = computed(() => {
  const shortfall = props.result.accountSafety.filter(entry => entry.availableMinor < 0).sort((a, b) => a.availableMinor - b.availableMinor)[0]
  const safety = shortfall ?? props.result.safety
  const detail = safety ? translate('planningCashAccountDetail', { name: safety.name, projected: money(safety.projectedMinor), amount: money(safety.availableMinor), reserve: money(safety.reserveMinor), date: forecastDay(safety.date, props.forecast.today) }) : ''
  if (payingWithCredit.value) return { ok: false, title: translate('planningCreditLimitUnknown'), text: `${translate('planningCreditLimitHelp')}${shortfall ? ` ${detail}` : ''}` }
  if (!safety) return null
  const stale = props.forecast.dataDays < 21 || props.forecast.planning.accounts.some(entry => !entry.balanceUpdatedAt || Date.now() - Date.parse(entry.balanceUpdatedAt) > 48 * 60 * 60 * 1000 || entry.fx === 'missing' || entry.fx === 'stale')
  if (props.result.unavailableAccounts) return { ok: false, title: translate('planningUnavailableAccounts'), text: detail }
  if (shortfall) return { ok: false, title: translate('planningReserveAtRisk'), text: detail }
  if (stale) return { ok: false, title: translate('planningVerifyBeforeSpending'), text: detail }
  if (props.result.cashRiskDate) return { ok: false, title: translate('planningCashRangeRisk'), text: `${translate('planningCashRangeHelp', { date: forecastDay(props.result.cashRiskDate, props.forecast.today) })} ${detail}` }
  return { ok: true, title: translate('planningReserveMaintained'), text: detail }
})
function stress(kind: 'late' | 'spending') {
  scenario.value = kind === 'late' ? { ...scenario.value, incomeDelayDays: scenario.value.incomeDelayDays ? 0 : 7 } : { ...scenario.value, spendingChange: scenario.value.spendingChange ? 0 : 0.15 }
}

</script>

<template>
  <SectionCard :title="$t('whatIf3')" body-class="gap-5">
    <template #action>
      <UButton v-if="active" :label="$t('reset')" icon="i-lucide-rotate-ccw" color="neutral" variant="link" size="sm" class="-me-1.5 text-muted" @click="reset" />
    </template>
    <p class="-my-1 text-sm text-muted">{{ $t('tryAChangeAndTheChartUpdates') }}</p>

    <UFormField :label="$t('planningPayingAccount')"><USelect v-model="account" :items="accountOptions" class="w-full" /></UFormField>
    <UFormField :label="`${$t('planningMinimumReserve')} (${forecast.currency})`"><UInput v-model="reserve" :disabled="payingWithCredit" inputmode="decimal" class="w-full" /></UFormField>
    <UCheckbox v-model="protectGoals" :label="$t('planningProtectGoals')" />
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
      <div id="whatif-answer" class="sticky top-2 z-10 bg-default" aria-live="polite">
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

    <UFormField :label="$t('planningSpendingSource')"><USelect v-model="spendingMode" :items="spendingOptions" class="w-full" /></UFormField>
    <UFormField :label="`${$t('planningSpendingChange')} ${formatPercent(spendingChange / 100, { signed: true })}`"><USlider v-model="spendingChange" :min="-50" :max="100" :step="5" :aria-label="$t('planningSpendingChange')" /></UFormField>
    <div class="flex flex-col gap-2">
      <p class="text-sm font-medium text-highlighted">{{ $t('planningStressTests') }}</p>
      <UButton :label="$t('planningSalaryLate')" :variant="scenario.incomeDelayDays ? 'soft' : 'outline'" color="neutral" :aria-pressed="!!scenario.incomeDelayDays" @click="stress('late')" />
      <UButton :label="$t('planningSpendingHigher')" :variant="scenario.spendingChange ? 'soft' : 'outline'" color="neutral" :aria-pressed="!!scenario.spendingChange" @click="stress('spending')" />
    </div>
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
