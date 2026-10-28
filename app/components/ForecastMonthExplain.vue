<script setup lang="ts">
import type { ForecastMonth, ForecastPayment, ForecastSeries } from "#shared/api"

// How a month gets from its first balance to its last, as a waterfall: each step a floating bar from the balance
// before it to the balance after, the payments behind income and bills listed under them.
const props = defineProps<{
  month: ForecastMonth
  today: string
  currency: string
  payments: ForecastPayment[]
  series: ForecastSeries[]
}>()
const { format } = useMoney()
const money = (minor: number, signed = false) => format(minor, props.currency, { signed })
const byId = computed(() => new Map(props.series.map((entry) => [entry.id, entry])))
const inMonth = computed(() =>
  props.payments
    .filter((payment) => payment.date.startsWith(props.month.month))
    .map((payment) => ({ ...payment, series: byId.value.get(payment.seriesId)! }))
    .filter((payment) => payment.series),
)
const current = computed(() => props.today.startsWith(props.month.month))

const steps = computed(() => {
  const month = props.month
  const list = [
    { key: "income" as const, get label() { return translate('income') }, change: month.incomeMinor, items: inMonth.value.filter((payment) => payment.series.kind === "income") },
    { key: "bills" as const, get label() { return translate('bills') }, change: -month.billsMinor, items: inMonth.value.filter((payment) => payment.series.kind === "bill" && payment.seriesId !== "plan:purchase") },
    { key: "variable" as const, label: current.value ? translate('usualSpendingRestOfMonth') : translate('usualSpending'), change: -month.variableOutMinor, items: [] },
    { key: "moved" as const, label: month.movedOutMinor >= 0 ? translate('movedOut') : translate('movedIn'), change: -month.movedOutMinor, items: [] },
    { key: "oneOff" as const, get label() { return translate('oneOffWhatIf') }, change: -month.oneOffMinor, items: inMonth.value.filter(payment => payment.seriesId === "plan:purchase") },
  ].filter((step) => step.change !== 0 || step.key === "income" || step.key === "bills")
  let running = month.startMinor
  return list.map((step) => {
    const from = running
    running += step.change
    return { ...step, from, to: running }
  })
})
const domain = computed(() => {
  // Zoomed to where the balance moves this month (zero would squash every step into a sliver), with some room below.
  const values = [props.month.startMinor, props.month.balanceMinor, ...steps.value.flatMap((step) => [step.from, step.to])]
  const min = Math.min(...values)
  const max = Math.max(...values)
  return { min: min - (max - min) * 0.25, max }
})
const pct = (value: number) => ((value - domain.value.min) / Math.max(1, domain.value.max - domain.value.min)) * 100
const bar = (from: number, to: number) => ({ left: `${pct(Math.min(from, to))}%`, width: `${Math.max(0.8, Math.abs(pct(to) - pct(from)))}%` })
const open = ref<string | null>(null)
watch(
  () => props.month.month,
  () => (open.value = null),
)
</script>

<template>
  <div class="flex flex-col gap-3" aria-live="polite">
    <div>
      <p class="text-sm font-medium text-highlighted">{{ formatMonth(month.month) }}</p>
      <p class="text-xs text-muted">
        <span :class="month.netMinor >= 0 ? FLOW.income.text : 'text-error'" class="money font-medium">{{ money(month.netMinor, true) }}</span>
        {{ month.netMinor >= 0 ? $t('leftOver') : $t('moreOutThanIn') }}
      </p>
    </div>
    <ol class="flex flex-col gap-2 text-sm">
      <li class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
        <span class="text-muted">{{ current ? $t('today') : $t('startsWith') }}</span>
        <span class="money text-highlighted">{{ money(month.startMinor) }}</span>
        <span class="relative col-span-2 h-1.5 rounded-full bg-elevated" aria-hidden="true">
          <span class="absolute inset-y-0 rounded-full bg-(--chart-line)" :style="bar(domain.min, month.startMinor)" />
        </span>
      </li>
      <li v-for="step in steps" :key="step.key" class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
        <button
          v-if="step.items.length"
          type="button"
          class="-mx-1 flex items-center gap-1 rounded px-1 text-left text-default outline-none hover:text-highlighted focus-visible:ring-2 focus-visible:ring-primary/50"
          :aria-expanded="open === step.key"
          @click="open = open === step.key ? null : step.key"
        >
          {{ step.label }} <span class="text-xs text-muted">({{ step.items.length }})</span>
          <UIcon name="i-lucide-chevron-down" class="size-3.5 text-muted transition-transform duration-150 motion-reduce:transition-none" :class="open === step.key && 'rotate-180'" />
        </button>
        <span v-else class="text-default">{{ step.label }}</span>
        <span class="money" :class="step.change > 0 ? FLOW.income.text : 'text-highlighted'">{{ money(step.change, true) }}</span>
        <span class="relative col-span-2 h-1.5 rounded-full bg-elevated" aria-hidden="true">
          <span class="absolute inset-y-0 rounded-full" :class="FLOW[step.key].bg" :style="bar(step.from, step.to)" />
        </span>
        <ul v-if="open === step.key" class="col-span-2 mt-1 flex flex-col gap-1 border-l border-default pl-3 text-xs">
          <li v-for="item in step.items" :key="`${item.seriesId}-${item.date}`" class="flex items-center gap-2">
            <span class="w-12 shrink-0 text-muted tabular-nums">{{ forecastDay(item.date, today, { weekday: false }) }}</span>
            <span class="min-w-0 flex-1 truncate text-default">{{ item.series.name }}</span>
            <span class="money" :class="item.amountMinor > 0 ? FLOW.income.text : 'text-default'">{{ money(item.amountMinor, true) }}</span>
          </li>
        </ul>
      </li>
      <li class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-t border-default pt-2">
        <span class="font-medium text-highlighted">{{ $t('endsWith') }}</span>
        <span class="money font-semibold text-highlighted">{{ money(month.balanceMinor) }}</span>
        <span class="col-span-2 text-xs text-muted tabular-nums">{{ $t('likelyTo2', { value1: money(month.lowMinor), value2: money(month.highMinor) }) }}</span>
      </li>
    </ol>
  </div>
</template>
