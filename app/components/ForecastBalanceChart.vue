<script setup lang="ts">
import type { ForecastDay } from "#shared/api"
import { scaleLinear, scaleSqrt, scaleUtc } from "d3-scale"
import { area, line } from "d3-shape"

// The balance over time: the actual balance up to today (solid), the expected one after (dashed) inside its likely range,
// a what-if over the plain forecast, the lowest point, and a lane of the payments under it (in above, out below).
// The pointer or the arrow keys scrub day by day (Shift: a week, Page Up/Down: a month) and explain the day.

export interface ChartPayment {
  date: string
  name: string
  amountMinor: number
  kind: "income" | "bill" | "transfer"
}

const props = withDefaults(
  defineProps<{
    today: string
    history: Array<{ date: string; balanceMinor: number }>
    /** What the chart shows: the forecast, with a what-if when one is on. */
    days: ForecastDay[]
    /** The forecast without the what-if, drawn under it; null when no what-if is on. */
    baseline?: ForecastDay[] | null
    payments: ChartPayment[]
    lowest: { date: string; balanceMinor: number }
    /** Everyday spending and moves expected on a day (positive), for the explanation. */
    usualOn: (date: string) => number
    format: (minor: number) => string
    formatAxis: (minor: number) => string
    label: string
    /** Taller on wide screens by default. */
    height?: number
  }>(),
  { baseline: null, height: undefined },
)

const box = useTemplateRef<HTMLElement>("box")
const { width } = useElementSize(box)
const narrow = computed(() => width.value < 560)
const boxHeight = computed(() => props.height ?? (narrow.value ? 260 : 380))
// Under the plot: the month labels, then the payments lane.
const AXIS = 20
const LANE = 30
const pad = computed(() => ({ top: 20, right: narrow.value ? 8 : 12, bottom: AXIS + LANE, left: narrow.value ? 46 : 58 }))
const plotBottom = computed(() => boxHeight.value - pad.value.bottom)

const time = (date: string) => utcDay(date).getTime()
interface Point {
  date: string
  actual: number | null
  expected: number | null
  low: number | null
  high: number | null
  baseline: number | null
}
// One timeline: actual days, then forecast days; today has both.
const points = computed<Point[]>(() => {
  const baseline = new Map((props.baseline ?? []).map((day) => [day.date, day.balanceMinor]))
  const list: Point[] = props.history.map((day) => ({ date: day.date, actual: day.balanceMinor, expected: null, low: null, high: null, baseline: null }))
  for (const day of props.days) {
    const entry = { actual: null, expected: day.balanceMinor, low: day.lowMinor, high: day.highMinor, baseline: baseline.get(day.date) ?? null }
    const last = list.at(-1)
    if (last?.date === day.date) Object.assign(last, entry)
    else list.push({ date: day.date, ...entry })
  }
  return list
})

const x = computed(() => {
  const first = points.value[0]?.date ?? props.today
  const last = points.value.at(-1)?.date ?? props.today
  return scaleUtc()
    .domain([utcDay(first), utcDay(last)])
    .range([pad.value.left, Math.max(pad.value.left + 1, width.value - pad.value.right)])
})
const y = computed(() => {
  const values = points.value.flatMap((point) => [point.actual, point.low, point.high, point.baseline].filter((value): value is number => value !== null))
  let min = Math.min(0, ...values)
  let max = Math.max(...values, 1)
  // Leave zero out when the balance never comes near it, so the line uses the height.
  const lowest = Math.min(...values)
  if (lowest > 0 && lowest > max * 0.35) min = lowest
  const room = (max - min) * 0.06 || 1
  return scaleLinear()
    .domain([min === 0 ? 0 : min - room, max + room])
    .range([plotBottom.value, pad.value.top])
    .nice(4)
})
const yTicks = computed(() => y.value.ticks(narrow.value ? 3 : 4))
const xTicks = computed(() => {
  const ticks = x.value.ticks(Math.max(2, Math.floor(width.value / (narrow.value ? 70 : 90))))
  return ticks.map((date) => ({ at: x.value(date), label: forecastMonthTick(date.toISOString().slice(0, 10), props.today) }))
})

const px = (date: string) => x.value(utcDay(date))
const actualPath = computed(() =>
  line<Point>()
    .defined((point) => point.actual !== null)
    .x((point) => px(point.date))
    .y((point) => y.value(point.actual!))(points.value) ?? "",
)
const forecastPath = computed(() =>
  line<Point>()
    .defined((point) => point.expected !== null)
    .x((point) => px(point.date))
    .y((point) => y.value(point.expected!))(points.value) ?? "",
)
const baselinePath = computed(() =>
  props.baseline
    ? (line<Point>()
        .defined((point) => point.baseline !== null)
        .x((point) => px(point.date))
        .y((point) => y.value(point.baseline!))(points.value) ?? "")
    : "",
)
const bandPath = computed(() =>
  area<Point>()
    .defined((point) => point.low !== null)
    .x((point) => px(point.date))
    .y0((point) => y.value(point.low!))
    .y1((point) => y.value(point.high!))(points.value) ?? "",
)
// The what-if's difference from the plain forecast, shaded green when it leaves more money and rose when less.
const deltaPath = computed(() =>
  props.baseline
    ? (area<Point>()
        .defined((point) => point.baseline !== null && point.expected !== null)
        .x((point) => px(point.date))
        .y0((point) => y.value(point.baseline!))
        .y1((point) => y.value(point.expected!))(points.value) ?? "")
    : "",
)
const better = computed(() => {
  const last = props.days.at(-1)
  const base = props.baseline?.at(-1)
  return last && base ? last.balanceMinor >= base.balanceMinor : true
})
const zeroY = computed(() => y.value(0))
const showZero = computed(() => y.value.domain()[0]! < 0)

// Payments by day, in and out apart, sized by amount.
const lanes = computed(() => {
  const days = new Map<string, { in: number; out: number }>()
  for (const payment of props.payments) {
    if (payment.kind === "transfer") continue
    const entry = days.get(payment.date) ?? { in: 0, out: 0 }
    if (payment.amountMinor > 0) entry.in += payment.amountMinor
    else entry.out -= payment.amountMinor
    days.set(payment.date, entry)
  }
  return [...days].map(([date, sums]) => ({ date, ...sums }))
})
const radius = computed(() => {
  const max = Math.max(1, ...lanes.value.map((day) => Math.max(day.in, day.out)))
  return scaleSqrt().domain([0, max]).range([0, narrow.value ? 5 : 6.5])
})
const laneY = computed(() => ({ in: plotBottom.value + AXIS + 9, out: plotBottom.value + AXIS + 22 }))

// Scrubbing.
const active = ref<number | null>(null)
const focused = ref(false)
const todayIndex = computed(() => Math.max(0, points.value.findIndex((point) => point.date === props.today)))
function pointAt(event: PointerEvent) {
  if (!box.value || points.value.length === 0) return
  const left = box.value.getBoundingClientRect().left
  const date = x.value.invert(event.clientX - left)
  const target = date.getTime()
  let best = 0
  let distance = Infinity
  // Points are one a day, in order: a binary search would do, but a year is 500 points.
  points.value.forEach((point, index) => {
    const gap = Math.abs(time(point.date) - target)
    if (gap < distance) [best, distance] = [index, gap]
  })
  active.value = best
}
function onKey(event: KeyboardEvent) {
  const last = points.value.length - 1
  if (last < 0) return
  const current = active.value ?? todayIndex.value
  const step = event.shiftKey ? 7 : 1
  const moves: Record<string, number> = {
    ArrowLeft: current - step,
    ArrowRight: current + step,
    PageUp: current - 30,
    PageDown: current + 30,
    Home: 0,
    End: last,
  }
  if (!(event.key in moves)) {
    if (event.key === "Escape") active.value = null
    return
  }
  event.preventDefault()
  active.value = Math.min(last, Math.max(0, moves[event.key]!))
}
function onBlur() {
  focused.value = false
  active.value = null
}
function onFocus() {
  focused.value = true
  if (active.value === null) active.value = todayIndex.value
}

const current = computed(() => (active.value === null ? null : (points.value[active.value] ?? null)))
const currentPayments = computed(() => (current.value ? props.payments.filter((payment) => payment.date === current.value!.date) : []))
const currentY = computed(() => {
  const point = current.value
  if (!point) return null
  const value = point.expected ?? point.actual
  return value === null ? null : y.value(value)
})
const tooltipSide = computed(() => (current.value && px(current.value.date) > width.value / 2 ? "left" : "right"))
const tooltipStyle = computed(() => {
  if (!current.value) return {}
  const at = px(current.value.date)
  return tooltipSide.value === "right" ? { left: `${Math.min(at + 12, width.value - 232)}px` } : { left: `${Math.max(0, at - 232)}px` }
})
const describe = (point: Point) => {
  const parts: string[] = []
  if (point.actual !== null && point.date !== props.today) parts.push(`balance ${props.format(point.actual)}`)
  else if (point.expected !== null) {
    parts.push(`expected ${props.format(point.expected)}`)
    if (point.low !== null && point.high !== null && point.high > point.low) parts.push(`likely ${props.format(point.low)} to ${props.format(point.high)}`)
  }
  const named = props.payments.filter((payment) => payment.date === point.date && payment.kind !== "transfer")
  if (named.length) parts.push(named.map((payment) => `${payment.name} ${props.format(payment.amountMinor)}`).join(", "))
  return `${forecastDay(point.date, props.today)}: ${parts.join("; ")}`
}
const announcement = computed(() => (current.value && focused.value ? describe(current.value) : ""))
const summary = computed(() => {
  const end = props.days.at(-1)
  if (!end) return `${props.label}: no data yet`
  return `${props.label}. Today ${props.format(props.days[0]!.balanceMinor)}; expected ${props.format(end.balanceMinor)} on ${forecastDay(end.date, props.today)}, likely between ${props.format(end.lowMinor)} and ${props.format(end.highMinor)}. Lowest ${props.format(props.lowest.balanceMinor)} on ${forecastDay(props.lowest.date, props.today)}. Use the arrow keys to go day by day.`
})

// Labels drawn in HTML over the SVG.
const lowestPoint = computed(() => {
  if (!props.lowest.date || !width.value) return null
  const at = px(props.lowest.date)
  const top = y.value(props.lowest.balanceMinor)
  // A lowest point has the line above it on both sides, so the label goes under it unless that runs off the plot.
  return { left: Math.min(Math.max(at, 70), width.value - 70), dotX: at, top, below: top < plotBottom.value - 34 }
})
</script>

<template>
  <div
    ref="box"
    class="relative w-full touch-pan-y select-none outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-primary/50"
    :style="{ height: `${boxHeight}px` }"
    tabindex="0"
    role="group"
    aria-roledescription="chart"
    :aria-label="summary"
    @pointermove="pointAt"
    @pointerdown="pointAt"
    @pointerleave="!focused && (active = null)"
    @keydown="onKey"
    @focus="onFocus"
    @blur="onBlur"
  >
    <svg v-if="width" :width="width" :height="boxHeight" class="block overflow-visible" aria-hidden="true">
      <defs>
        <pattern id="forecast-below-zero" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" class="stroke-error/25" stroke-width="2" />
        </pattern>
      </defs>
      <!-- Grid and axes -->
      <g>
        <line
          v-for="tick in yTicks"
          :key="tick"
          :x1="pad.left"
          :x2="width - pad.right"
          :y1="y(tick)"
          :y2="y(tick)"
          stroke="var(--chart-grid)"
          :stroke-dasharray="tick === 0 ? undefined : '2 4'"
        />
        <text
          v-for="tick in yTicks"
          :key="`y-${tick}`"
          :x="pad.left - 8"
          :y="y(tick)"
          text-anchor="end"
          dominant-baseline="middle"
          class="fill-(--ui-text-muted) text-[11px] tabular-nums"
        >
          {{ formatAxis(tick) }}
        </text>
        <text v-for="tick in xTicks" :key="`x-${tick.at}`" :x="tick.at" :y="plotBottom + 14" text-anchor="middle" class="fill-(--ui-text-muted) text-[11px]">
          {{ tick.label }}
        </text>
      </g>
      <!-- Below zero -->
      <rect v-if="showZero" :x="pad.left" :y="zeroY" :width="Math.max(0, width - pad.left - pad.right)" :height="Math.max(0, plotBottom - zeroY)" fill="url(#forecast-below-zero)" />
      <line v-if="showZero" :x1="pad.left" :x2="width - pad.right" :y1="zeroY" :y2="zeroY" class="stroke-error/60" stroke-width="1" />
      <!-- Today -->
      <line :x1="px(today)" :x2="px(today)" :y1="pad.top - 8" :y2="plotBottom" class="stroke-(--ui-text-muted)" stroke-dasharray="3 3" stroke-opacity="0.6" />
      <!-- Range, what-if difference, lines -->
      <path :d="bandPath" class="fill-primary/10 dark:fill-primary/15" />
      <path v-if="baseline" :d="deltaPath" :class="better ? 'fill-emerald-500/15' : 'fill-rose-500/12'" />
      <path
        v-if="baseline"
        :d="baselinePath"
        fill="none"
        class="stroke-(--ui-text-muted)"
        stroke-width="1.25"
        stroke-dasharray="4 3"
        stroke-linejoin="round"
      />
      <path :d="actualPath" fill="none" stroke="var(--chart-line)" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" />
      <path
        :d="forecastPath"
        fill="none"
        class="stroke-primary"
        stroke-width="2"
        stroke-dasharray="6 3"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      <!-- Payments lane -->
      <g>
        <text :x="pad.left - 8" :y="laneY.in" text-anchor="end" dominant-baseline="middle" class="fill-emerald-600 text-[10px] font-medium dark:fill-emerald-400">In</text>
        <text :x="pad.left - 8" :y="laneY.out" text-anchor="end" dominant-baseline="middle" class="fill-rose-600 text-[10px] font-medium dark:fill-rose-400">Out</text>
        <template v-for="day in lanes" :key="day.date">
          <circle v-if="day.in" :cx="px(day.date)" :cy="laneY.in" :r="Math.max(2, radius(day.in))" class="fill-emerald-500/80 dark:fill-emerald-400/80" />
          <circle v-if="day.out" :cx="px(day.date)" :cy="laneY.out" :r="Math.max(2, radius(day.out))" class="fill-rose-500/75 dark:fill-rose-400/75" />
        </template>
      </g>
      <!-- Lowest point -->
      <circle
        v-if="lowestPoint"
        :cx="lowestPoint.dotX"
        :cy="lowestPoint.top"
        r="4.5"
        class="stroke-(--ui-bg)"
        stroke-width="2"
        :class="lowest.balanceMinor < 0 ? 'fill-error' : 'fill-warning'"
      />
      <!-- Scrubber -->
      <g v-if="current">
        <line :x1="px(current.date)" :x2="px(current.date)" :y1="pad.top" :y2="plotBottom" stroke="var(--chart-line)" stroke-opacity="0.3" />
        <line :x1="px(current.date)" :x2="px(current.date)" :y1="laneY.in - 7" :y2="laneY.out + 7" stroke="var(--chart-line)" stroke-opacity="0.3" />
        <circle
          v-if="currentY !== null"
          :cx="px(current.date)"
          :cy="currentY"
          r="4.5"
          fill="var(--ui-bg)"
          stroke-width="2"
          :class="current.expected !== null ? 'stroke-primary' : 'stroke-(--chart-line)'"
        />
      </g>
    </svg>

    <template v-if="width">
      <span class="pointer-events-none absolute -translate-x-1/2 text-[11px] font-medium text-muted" :style="{ left: `${px(today)}px`, top: '-2px' }">Today</span>
      <span
        v-if="lowestPoint && !current"
        class="pointer-events-none absolute -translate-x-1/2 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ring ring-default"
        :class="lowest.balanceMinor < 0 ? 'bg-error/10 text-error ring-error/25' : 'bg-default text-highlighted'"
        :style="{ left: `${lowestPoint.left}px`, top: `${lowestPoint.below ? lowestPoint.top + 10 : lowestPoint.top - 28}px` }"
      >
        Lowest <span class="money">{{ formatAxis(lowest.balanceMinor) }}</span> · {{ forecastDay(lowest.date, today, { weekday: false }) }}
      </span>
    </template>

    <div
      v-if="current"
      class="pointer-events-none absolute top-0 z-10 w-56 rounded-lg bg-default/95 p-3 shadow-lg ring ring-default backdrop-blur-sm"
      :style="tooltipStyle"
      aria-hidden="true"
    >
      <p class="text-xs text-muted">
        {{ forecastDay(current.date, today) }} <span class="text-dimmed">· {{ forecastWhen(current.date, today) }}</span>
      </p>
      <template v-if="current.expected === null || (current.actual !== null && current.date === today)">
        <p class="money mt-1 text-base font-semibold text-highlighted">{{ format(current.actual ?? 0) }}</p>
        <p class="text-xs text-muted">{{ current.date === today ? "Balance today" : "Actual balance" }}</p>
      </template>
      <template v-else>
        <p class="money mt-1 text-base font-semibold text-highlighted">{{ format(current.expected) }}</p>
        <p class="text-xs text-muted">
          Expected<template v-if="current.high! > current.low!">, likely <span class="money">{{ formatAxis(current.low!) }}</span> to <span class="money">{{ formatAxis(current.high!) }}</span></template>
        </p>
        <p v-if="current.baseline !== null && current.baseline !== current.expected" class="mt-0.5 text-xs text-muted">
          Without the what-if <span class="money">{{ format(current.baseline) }}</span>
        </p>
      </template>
      <ul v-if="currentPayments.length || (current.date > today && usualOn(current.date))" class="mt-2 flex flex-col gap-1 border-t border-default pt-2 text-xs">
        <li v-for="payment in currentPayments.slice(0, 5)" :key="payment.name" class="flex items-center gap-2">
          <span class="size-1.5 shrink-0 rounded-full" :class="kindFlow(payment.kind).bg" />
          <span class="min-w-0 flex-1 truncate text-default">{{ payment.name }}</span>
          <span class="money" :class="payment.amountMinor > 0 ? FLOW.income.text : 'text-default'">{{ format(payment.amountMinor) }}</span>
        </li>
        <li v-if="currentPayments.length > 5" class="text-muted">and {{ currentPayments.length - 5 }} more</li>
        <li v-if="current.date > today && usualOn(current.date)" class="flex items-center gap-2">
          <span class="size-1.5 shrink-0 rounded-full" :class="FLOW.variable.bg" />
          <span class="min-w-0 flex-1 truncate text-muted">Usual outgoings</span>
          <span class="money text-muted">{{ format(-usualOn(current.date)) }}</span>
        </li>
      </ul>
    </div>
    <p class="sr-only" aria-live="polite">{{ announcement }}</p>
  </div>
</template>
