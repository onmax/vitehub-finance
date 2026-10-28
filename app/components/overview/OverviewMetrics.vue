<script setup lang="ts">
import type { Overview } from "#shared/api"
import { relativeChange, savingsRate } from "#shared/overview-metrics"

const props = defineProps<{ overview: Overview }>()
const { format } = useMoney()
const month = computed(() => props.overview.month)
const through = computed(() => month.value.series.at(-1)?.date ?? `${month.value.month}-01`)
const period = computed(() => `${formatDay(`${month.value.month}-01`, { relative: false })} – ${formatDay(through.value, { relative: false })}`)
const worth = computed(() => props.overview.netWorthSeries.slice(-31))
const worthChange = computed(() => {
  const first = worth.value[0]
  if (!first || worth.value.length < 2) return null
  return {
    delta: props.overview.netWorthMinor - first.valueMinor,
    share: relativeChange(props.overview.netWorthMinor, first.valueMinor),
    since: first.date,
  }
})
const worthComparison = computed(() => {
  const change = worthChange.value
  if (!change) return null
  return change.share === null
    ? format(change.delta, props.overview.currency, { signed: true, compact: true })
    : formatPercent(change.share, { signed: true, digits: 1 })
})
const rate = computed(() => savingsRate(month.value.inMinor, month.value.outMinor))
const previousRate = computed(() => savingsRate(month.value.previousInMinor, month.value.previousOutMinor))
const rateChange = computed(() => rate.value !== null && previousRate.value !== null ? rate.value - previousRate.value : null)
const rateComparison = computed(() => {
  if (rateChange.value === null) return null
  const percent = formatPercent(rateChange.value, { signed: true, digits: 1 }) ?? ""
  return translate('overviewPercentagePoints', { value: percent.replace(/[%％]/g, '').trim() })
})
const flows = computed(() => [
  { id: "in", label: translate('moneyIn'), value: month.value.inMinor, previous: month.value.previousInMinor, values: month.value.series.map((point) => point.inMinor) },
  { id: "out", label: translate('moneyOut'), value: month.value.outMinor, previous: month.value.previousOutMinor, values: month.value.series.map((point) => point.outMinor) },
])
const samePeriod = computed(() => translate('overviewComparedSamePeriod'))
const rateContext = computed(() => rate.value === null ? translate('overviewSavingsNeedsIncome') : previousRate.value === null ? translate('overviewNoPreviousIncome') : samePeriod.value)
</script>

<template>
  <div class="grid gap-3 min-[360px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
    <OverviewMetricCard
      :label="$t('netWorth')" :period="$t('today')" to="/accounts"
      :values="worth.map((point) => point.valueMinor)" :trend-label="$t('overviewWorthTrend')"
      :comparison="worthComparison"
      :delta="worthChange?.delta ?? null"
      :context="worthChange ? $t('since', { value1: formatDay(worthChange.since, { relative: false }) }) : $t('overviewNoBalanceComparison')"
    >
      <span :title="format(overview.netWorthMinor, overview.currency)"><Money :minor="overview.netWorthMinor" :currency="overview.currency" compact original="below" align="start" /></span>
    </OverviewMetricCard>
    <OverviewMetricCard
      v-for="flow in flows" :key="flow.id" :label="flow.label" :period="period"
      :to="{ path: '/transactions', query: { from: `${month.month}-01`, to: through, view: flow.id } }"
      :values="flow.values" :trend-label="$t('overviewCumulativeTrend', { metric: flow.label })"
      :comparison="formatPercent(relativeChange(flow.value, flow.previous), { signed: true, digits: 1 })"
      :delta="flow.value - flow.previous"
      :context="flow.previous ? samePeriod : $t('nothingLastMonthToCompareWith')"
    >
      <span :title="format(flow.value, overview.currency)"><Money :minor="flow.value" :currency="overview.currency" compact original="below" align="start" /></span>
    </OverviewMetricCard>
    <OverviewMetricCard
      :label="$t('overviewSavingsRate')" :period="period" to="#money-flow"
      :values="month.series.map((point) => savingsRate(point.inMinor, point.outMinor))" :trend-label="$t('overviewSavingsTrend')"
      :comparison="rateComparison" :delta="rateChange" :context="rateContext"
    >
      <span :title="$t('overviewSavingsDefinition')">{{ rate === null ? '—' : formatPercent(rate, { digits: 1 }) }}</span>
      <span class="sr-only">{{ $t('overviewSavingsDefinition') }}</span>
    </OverviewMetricCard>
  </div>
</template>
