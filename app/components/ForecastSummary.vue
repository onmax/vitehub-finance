<script setup lang="ts">
import type { Forecast, ForecastDay } from "#shared/api"

// The four numbers people look for first, in one row like Xero's cash flow manager: cash today, the next 30 days' net,
// the lowest point, and where it ends. With a what-if on, each says how much it moves.
const props = defineProps<{
  forecast: Forecast
  days: ForecastDay[]
  lowest: { date: string; balanceMinor: number; lowMinor: number }
  riskDate: string | null
  next30: { inMinor: number; outMinor: number }
  baseline: { end: number; lowest: number; next30: number } | null
}>()
const { format } = useMoney()
const money = (minor: number, options: { signed?: boolean } = {}) => format(minor, props.forecast.currency, { compact: true, ...options })
const end = computed(() => props.days.at(-1)!)
const net30 = computed(() => props.next30.inMinor - props.next30.outMinor)
const delta = (now: number, before: number | undefined) => (before === undefined || now === before ? null : money(now - before, { signed: true }))
const lowTone = computed(() => (props.lowest.balanceMinor < 0 ? "text-rose-600 dark:text-rose-400" : props.riskDate ? "text-amber-600 dark:text-amber-400" : "text-highlighted"))
</script>

<template>
  <dl class="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-(--ui-border) ring ring-default lg:grid-cols-4">
    <div class="bg-default p-4">
      <dt class="text-xs font-medium text-muted">Cash today</dt>
      <dd class="money mt-1 text-xl font-semibold tracking-[-0.02em] text-highlighted sm:text-2xl">{{ money(forecast.startMinor) }}</dd>
      <dd class="mt-1 text-xs text-muted">
        {{ forecast.accounts.length }} {{ forecast.accounts.length === 1 ? "account" : "accounts" }} you can spend from
      </dd>
    </div>
    <div class="bg-default p-4">
      <dt class="text-xs font-medium text-muted">Next 30 days</dt>
      <dd class="money mt-1 text-xl font-semibold tracking-[-0.02em] sm:text-2xl" :class="net30 >= 0 ? FLOW.income.text : 'text-highlighted'">
        {{ money(net30, { signed: true }) }}
      </dd>
      <dd class="mt-1 flex flex-wrap gap-x-2 text-xs text-muted tabular-nums">
        <span><span :class="FLOW.income.text">{{ money(next30.inMinor, { signed: true }) }}</span> in</span>
        <span>{{ money(-next30.outMinor, { signed: true }) }} out</span>
        <span v-if="baseline && delta(net30, baseline.next30)" class="text-violet-600 dark:text-violet-400">{{ delta(net30, baseline.next30) }} what-if</span>
      </dd>
    </div>
    <div class="bg-default p-4">
      <dt class="text-xs font-medium text-muted">Lowest point</dt>
      <dd class="money mt-1 text-xl font-semibold tracking-[-0.02em] sm:text-2xl" :class="lowTone">{{ money(lowest.balanceMinor) }}</dd>
      <dd class="mt-1 text-xs text-muted">
        {{ forecastDay(lowest.date, forecast.today, { weekday: false }) }}
        <template v-if="lowest.balanceMinor < 0"> · below zero</template>
        <template v-else-if="riskDate"> · may dip below zero from {{ forecastDay(riskDate, forecast.today, { weekday: false }) }}</template>
        <template v-else-if="lowest.lowMinor < lowest.balanceMinor"> · could be {{ money(lowest.lowMinor) }}</template>
        <span v-if="baseline && delta(lowest.balanceMinor, baseline.lowest)" class="text-violet-600 dark:text-violet-400"> · {{ delta(lowest.balanceMinor, baseline.lowest) }} what-if</span>
      </dd>
    </div>
    <div class="bg-default p-4">
      <dt class="text-xs font-medium text-muted">By {{ forecastDay(end.date, forecast.today, { weekday: false }) }}</dt>
      <dd class="money mt-1 text-xl font-semibold tracking-[-0.02em] text-highlighted sm:text-2xl">{{ money(end.balanceMinor) }}</dd>
      <dd class="mt-1 text-xs text-muted tabular-nums">
        Likely {{ money(end.lowMinor) }} to {{ money(end.highMinor) }}
        <span v-if="baseline && delta(end.balanceMinor, baseline.end)" class="text-violet-600 dark:text-violet-400"> · {{ delta(end.balanceMinor, baseline.end) }} what-if</span>
      </dd>
    </div>
  </dl>
</template>
