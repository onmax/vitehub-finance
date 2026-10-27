<script setup lang="ts">
// A balance over time: a line on a faint fill, three gridlines, and a crosshair with a tooltip that follows the pointer
// or the arrow keys. Plain SVG sized to its box (useElementSize); colors come from --chart-line and --chart-grid.
const props = withDefaults(
  defineProps<{
    points: Array<{ date: string; value: number }>
    /** Formats a value for the axis and the tooltip. */
    format: (value: number) => string
    /** Formats a point's date for the tooltip and the axis ("12 Oct"). */
    formatLabel?: (date: string) => string
    /** What the chart shows, for screen readers: "Net worth, last 90 days". */
    label: string
    height?: number
    /** A muted, still chart behind an empty state. */
    dimmed?: boolean
    /** Leaves out the y-axis labels. */
    bare?: boolean
  }>(),
  { height: 220, formatLabel: (date: string) => formatDay(date, { relative: false }) },
)

const box = useTemplateRef<HTMLElement>("box")
const { width } = useElementSize(box)
const pad = computed(() => ({ top: 12, right: 8, bottom: 24, left: props.bare ? 8 : 64 }))
const active = ref<number | null>(null)

const values = computed(() => props.points.map((point) => point.value))
const domain = computed(() => {
  if (values.value.length === 0) return { min: 0, max: 1 }
  let min = Math.min(...values.value)
  let max = Math.max(...values.value)
  if (min === max) {
    min -= Math.abs(min) * 0.1 || 1
    max += Math.abs(max) * 0.1 || 1
  }
  const room = (max - min) * 0.08
  return { min: min - room, max: max + room }
})

const innerWidth = computed(() => Math.max(0, width.value - pad.value.left - pad.value.right))
const innerHeight = computed(() => props.height - pad.value.top - pad.value.bottom)
const x = (index: number) =>
  pad.value.left + (props.points.length <= 1 ? innerWidth.value / 2 : (index / (props.points.length - 1)) * innerWidth.value)
const y = (value: number) =>
  pad.value.top + innerHeight.value - ((value - domain.value.min) / (domain.value.max - domain.value.min)) * innerHeight.value

const line = computed(() => props.points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(""))
const area = computed(() => {
  if (props.points.length === 0) return ""
  const base = pad.value.top + innerHeight.value
  return `${line.value}L${x(props.points.length - 1).toFixed(1)} ${base}L${x(0).toFixed(1)} ${base}Z`
})
const ticks = computed(() => [0, 0.5, 1].map((share) => domain.value.min + (domain.value.max - domain.value.min) * share))
const xTicks = computed(() => {
  const count = props.points.length
  if (count < 2) return []
  const picks = width.value < 480 ? [0, count - 1] : [0, Math.floor((count - 1) / 2), count - 1]
  return picks.map((index) => ({ index, label: props.formatLabel(props.points[index]!.date) }))
})

function pointAt(event: PointerEvent) {
  if (props.dimmed || props.points.length === 0 || !box.value) return
  const left = box.value.getBoundingClientRect().left
  const share = (event.clientX - left - pad.value.left) / Math.max(1, innerWidth.value)
  active.value = Math.min(props.points.length - 1, Math.max(0, Math.round(share * (props.points.length - 1))))
}

function onKey(event: KeyboardEvent) {
  const last = props.points.length - 1
  if (last < 0) return
  const moves: Record<string, number> = {
    ArrowLeft: (active.value ?? last + 1) - 1,
    ArrowRight: (active.value ?? -1) + 1,
    Home: 0,
    End: last,
  }
  if (!(event.key in moves)) return
  event.preventDefault()
  active.value = Math.min(last, Math.max(0, moves[event.key]!))
}

const current = computed(() => (active.value === null ? null : props.points[active.value]))
const summary = computed(() => {
  const first = props.points[0]
  const last = props.points.at(-1)
  if (!first || !last) return translate('noDataYet', { value1: props.label })
  const low = Math.min(...values.value)
  const high = Math.max(...values.value)
  return translate('fromOnToOnLowestHighest', { value1: props.label, value2: props.format(first.value), value3: props.formatLabel(first.date), value4: props.format(last.value), value5: props.formatLabel(last.date), value6: props.format(low), value7: props.format(high) })
})
const tooltipLeft = computed(() => {
  if (active.value === null) return 0
  return Math.min(Math.max(x(active.value), 72), Math.max(72, width.value - 72))
})
</script>

<template>
  <div
    ref="box"
    class="relative w-full touch-pan-y select-none outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-primary/50"
    :class="dimmed && 'pointer-events-none opacity-40'"
    :style="{ height: `${height}px` }"
    :tabindex="dimmed ? -1 : 0"
    role="img"
    :aria-label="summary"
    @pointermove="pointAt"
    @pointerdown="pointAt"
    @pointerleave="active = null"
    @keydown="onKey"
    @blur="active = null"
  >
    <svg v-if="width" :width="width" :height="height" class="block overflow-visible" aria-hidden="true">
      <g>
        <line
          v-for="tick in ticks"
          :key="tick"
          :x1="pad.left"
          :x2="width - pad.right"
          :y1="y(tick)"
          :y2="y(tick)"
          stroke="var(--chart-grid)"
          stroke-dasharray="3 3"
        />
        <template v-if="!bare">
          <text
            v-for="tick in ticks"
            :key="`label-${tick}`"
            :x="pad.left - 8"
            :y="y(tick)"
            text-anchor="end"
            dominant-baseline="middle"
            class="fill-(--ui-text-muted) text-[11px] tabular-nums"
          >
            {{ format(tick) }}
          </text>
        </template>
        <text
          v-for="(tick, position) in xTicks"
          :key="`x-${tick.index}`"
          :x="x(tick.index)"
          :y="height - 6"
          :text-anchor="position === 0 ? 'start' : position === xTicks.length - 1 ? 'end' : 'middle'"
          class="fill-(--ui-text-muted) text-[11px] tabular-nums"
        >
          {{ tick.label }}
        </text>
      </g>
      <path :d="area" fill="var(--chart-line)" fill-opacity="0.06" />
      <path :d="line" fill="none" stroke="var(--chart-line)" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" />
      <g v-if="current && active !== null">
        <line :x1="x(active)" :x2="x(active)" :y1="pad.top" :y2="pad.top + innerHeight" stroke="var(--chart-line)" stroke-opacity="0.25" />
        <circle :cx="x(active)" :cy="y(current.value)" r="4" fill="var(--ui-bg)" stroke="var(--chart-line)" stroke-width="2" />
      </g>
    </svg>
    <div
      v-if="current"
      class="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-default bg-default px-2.5 py-1.5 shadow-xs"
      :style="{ left: `${tooltipLeft}px` }"
      aria-live="polite"
    >
      <p class="text-xs text-muted tabular-nums">{{ formatLabel(current.date) }}</p>
      <p class="money text-sm font-medium text-highlighted">{{ format(current.value) }}</p>
    </div>
  </div>
</template>
