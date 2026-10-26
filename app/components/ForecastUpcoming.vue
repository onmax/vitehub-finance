<script setup lang="ts">
import type { ForecastPayment, ForecastSeries } from "#shared/api"
import { addDay } from "#shared/forecast"

// The next five weeks of expected payments: a calendar with what lands each day (like Origin's upcoming view), then
// what comes in and what goes out, each with when, from where, and how sure. Picking a day narrows the lists to it.
const props = defineProps<{ today: string; currency: string; series: ForecastSeries[]; payments: ForecastPayment[] }>()
const { format } = useMoney()
const money = (minor: number, compact = false) => format(minor, props.currency, { signed: true, compact })

const byId = computed(() => new Map(props.series.map((entry) => [entry.id, entry])))
const weekStart = computed(() => {
  const weekday = (utcDay(props.today).getUTCDay() + 6) % 7 // Monday first
  return addDay(props.today, -weekday)
})
const lastDay = computed(() => addDay(weekStart.value, 34))
const upcoming = computed(() =>
  props.payments
    .filter((payment) => payment.date <= lastDay.value)
    .map((payment) => ({ ...payment, series: byId.value.get(payment.seriesId)! }))
    .filter((payment) => payment.series && payment.series.kind !== "transfer"),
)
const days = computed(() =>
  Array.from({ length: 35 }, (_, index) => {
    const date = addDay(weekStart.value, index)
    const list = upcoming.value.filter((payment) => payment.date === date)
    return {
      date,
      number: Number(date.slice(8)),
      past: date < props.today,
      inMinor: list.filter((payment) => payment.amountMinor > 0).reduce((sum, payment) => sum + payment.amountMinor, 0),
      outMinor: list.filter((payment) => payment.amountMinor < 0).reduce((sum, payment) => sum + payment.amountMinor, 0),
      count: list.length,
    }
  }),
)
const weekdays = computed(() => days.value.slice(0, 7).map((day) => new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(utcDay(day.date))))

const selected = ref<string | null>(null)
const visible = computed(() => (selected.value ? upcoming.value.filter((payment) => payment.date === selected.value) : upcoming.value))
const incoming = computed(() => visible.value.filter((payment) => payment.amountMinor > 0))
const outgoing = computed(() => visible.value.filter((payment) => payment.amountMinor < 0))
const totalIn = computed(() => incoming.value.reduce((sum, payment) => sum + payment.amountMinor, 0))
const totalOut = computed(() => outgoing.value.reduce((sum, payment) => sum + payment.amountMinor, 0))
const showAllOut = ref(false)
const OUT_LIMIT = 6

const dayLabel = (day: (typeof days.value)[number]) => {
  const parts = [forecastDay(day.date, props.today)]
  if (day.inMinor) parts.push(`${money(day.inMinor)} in`)
  if (day.outMinor) parts.push(`${money(day.outMinor)} out`)
  if (!day.count) parts.push("nothing expected")
  return parts.join(", ")
}
function pick(date: string) {
  selected.value = selected.value === date ? null : date
}
</script>

<template>
  <SectionCard title="Coming up" body-class="gap-4">
    <template #action>
      <p class="flex gap-3 text-sm tabular-nums">
        <span><span class="text-muted">In</span> <span class="money font-medium" :class="FLOW.income.text">{{ money(totalIn) }}</span></span>
        <span><span class="text-muted">Out</span> <span class="money font-medium text-highlighted">{{ money(totalOut) }}</span></span>
      </p>
    </template>
    <p class="-mt-1 text-sm text-muted">Expected payments until {{ forecastDay(lastDay, today) }}. Pick a day to see only its payments.</p>

    <div>
      <div class="grid grid-cols-7 gap-1 border-b border-default pb-1.5 text-center text-[11px] font-medium text-muted" aria-hidden="true">
        <span v-for="name in weekdays" :key="name">{{ name }}</span>
      </div>
      <div class="grid grid-cols-7 gap-1 pt-1.5" role="group" aria-label="Pick a day to see its payments">
        <button
          v-for="day in days"
          :key="day.date"
          type="button"
          class="relative flex min-h-12 flex-col items-stretch gap-0.5 rounded-md p-1 text-left transition-[background-color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-16 sm:p-1.5"
          :class="[
            selected === day.date ? 'bg-primary/8 ring ring-primary/40 dark:bg-primary/12' : 'hover:bg-elevated/60',
            day.past && 'opacity-40',
          ]"
          :disabled="day.past"
          :aria-pressed="selected === day.date"
          :aria-label="dayLabel(day)"
          @click="pick(day.date)"
        >
          <span
            class="grid size-5 place-items-center rounded-full text-[11px] tabular-nums"
            :class="day.date === today ? 'bg-primary font-semibold text-inverted' : 'text-toned'"
            aria-hidden="true"
          >
            {{ day.number }}
          </span>
          <span v-if="day.inMinor" class="money hidden truncate rounded-sm bg-emerald-500/12 px-1 text-[10px] font-medium sm:block" :class="FLOW.income.text" aria-hidden="true">
            {{ money(day.inMinor, true) }}
          </span>
          <span v-if="day.outMinor" class="money hidden truncate rounded-sm bg-rose-500/10 px-1 text-[10px] font-medium sm:block" :class="FLOW.bills.text" aria-hidden="true">
            {{ money(day.outMinor, true) }}
          </span>
          <span class="mt-auto flex gap-0.5 sm:hidden" aria-hidden="true">
            <span v-if="day.inMinor" class="size-1.5 rounded-full" :class="FLOW.income.bg" />
            <span v-if="day.outMinor" class="size-1.5 rounded-full" :class="FLOW.bills.bg" />
          </span>
        </button>
      </div>
    </div>

    <div v-if="selected" class="flex items-center justify-between gap-2 text-sm">
      <p class="text-muted">
        {{ forecastDay(selected, today) }}: {{ visible.length ? `${visible.length} ${visible.length === 1 ? "payment" : "payments"}` : "nothing expected" }}
      </p>
      <UButton label="Show all days" color="neutral" variant="ghost" size="sm" icon="i-lucide-x" @click="selected = null" />
    </div>

    <div class="grid gap-6 md:grid-cols-2">
      <div class="min-w-0">
        <h3 class="flex items-center gap-2 text-sm font-medium text-highlighted">
          <UIcon name="i-lucide-arrow-down-left" class="size-4" :class="FLOW.income.text" />Coming in
        </h3>
        <p v-if="!incoming.length" class="mt-3 text-sm text-muted">
          {{ selected ? "No income expected that day." : "No regular income expected in these weeks." }}
        </p>
        <ul v-else class="mt-2 divide-y divide-default">
          <ForecastPaymentRow v-for="payment in incoming" :key="`${payment.seriesId}-${payment.date}`" :payment="payment" :today="today" :currency="currency" />
        </ul>
      </div>
      <div class="min-w-0">
        <h3 class="flex items-center gap-2 text-sm font-medium text-highlighted">
          <UIcon name="i-lucide-arrow-up-right" class="size-4" :class="FLOW.bills.text" />Going out
        </h3>
        <p v-if="!outgoing.length" class="mt-3 text-sm text-muted">{{ selected ? "No bills due that day." : "No bills due in these weeks." }}</p>
        <ul v-else class="mt-2 divide-y divide-default">
          <ForecastPaymentRow
            v-for="payment in showAllOut || selected ? outgoing : outgoing.slice(0, OUT_LIMIT)"
            :key="`${payment.seriesId}-${payment.date}`"
            :payment="payment"
            :today="today"
            :currency="currency"
          />
        </ul>
        <UButton
          v-if="!selected && outgoing.length > OUT_LIMIT"
          :label="showAllOut ? 'Show fewer' : `Show all ${outgoing.length}`"
          color="neutral"
          variant="link"
          size="sm"
          class="mt-1 px-0"
          @click="showAllOut = !showAllOut"
        />
      </div>
    </div>
  </SectionCard>
</template>
