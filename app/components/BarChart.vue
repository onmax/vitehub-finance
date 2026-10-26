<script setup lang="ts">
// Monthly bars around a zero line: positive segments stack up, negative ones down. Hover, tap, or the arrow keys show
// a bar's breakdown. Segment colors are CSS colors (var(--color-chart-1)…); a legend names them.
interface BarSegment {
  name: string
  value: number
  color: string
}

const props = withDefaults(
  defineProps<{
    bars: Array<{ label: string; segments: BarSegment[] }>
    format: (value: number) => string
    label: string
    height?: number
  }>(),
  { height: 240 },
)

const box = useTemplateRef<HTMLElement>("box")
const { width } = useElementSize(box)
const pad = { top: 12, right: 8, bottom: 24, left: 64 }
const active = ref<number | null>(null)

const sums = computed(() =>
  props.bars.map((bar) => ({
    up: bar.segments.filter((segment) => segment.value > 0).reduce((sum, segment) => sum + segment.value, 0),
    down: bar.segments.filter((segment) => segment.value < 0).reduce((sum, segment) => sum + segment.value, 0),
  })),
)
const domain = computed(() => {
  const max = Math.max(1, ...sums.value.map((sum) => sum.up))
  const min = Math.min(0, ...sums.value.map((sum) => sum.down))
  return { min: min * 1.08, max: max * 1.08 }
})
const innerWidth = computed(() => Math.max(0, width.value - pad.left - pad.right))
const innerHeight = computed(() => props.height - pad.top - pad.bottom)
const y = (value: number) => pad.top + innerHeight.value - ((value - domain.value.min) / (domain.value.max - domain.value.min)) * innerHeight.value
const slot = computed(() => innerWidth.value / Math.max(1, props.bars.length))
const barWidth = computed(() => Math.min(40, slot.value * 0.6))
const barX = (index: number) => pad.left + slot.value * index + (slot.value - barWidth.value) / 2

const rects = computed(() =>
  props.bars.map((bar) => {
    let up = 0
    let down = 0
    return bar.segments
      .filter((segment) => segment.value !== 0)
      .map((segment) => {
        const from = segment.value > 0 ? up : down
        const to = from + segment.value
        if (segment.value > 0) up = to
        else down = to
        const top = y(Math.max(from, to))
        return { ...segment, top, height: Math.max(1, Math.abs(y(from) - y(to))) }
      })
  }),
)
const ticks = computed(() => {
  const list = [domain.value.max / 1.08, 0]
  if (domain.value.min < 0) list.push(domain.value.min / 1.08)
  return list
})
const legend = computed(() => {
  const seen = new Map<string, string>()
  for (const bar of props.bars) for (const segment of bar.segments) seen.set(segment.name, segment.color)
  return [...seen].map(([name, color]) => ({ name, color }))
})

function onKey(event: KeyboardEvent) {
  const last = props.bars.length - 1
  const moves: Record<string, number> = {
    ArrowLeft: (active.value ?? last + 1) - 1,
    ArrowRight: (active.value ?? -1) + 1,
    Home: 0,
    End: last,
  }
  if (!(event.key in moves) || last < 0) return
  event.preventDefault()
  active.value = Math.min(last, Math.max(0, moves[event.key]!))
}
const current = computed(() => (active.value === null ? null : props.bars[active.value]))
const summary = computed(
  () =>
    `${props.label}. ` +
    props.bars
      .map((bar) => `${bar.label}: ${bar.segments.map((segment) => `${segment.name} ${props.format(segment.value)}`).join(", ")}`)
      .join("; "),
)
const tooltipLeft = computed(() =>
  active.value === null ? 0 : Math.min(Math.max(barX(active.value) + barWidth.value / 2, 90), Math.max(90, width.value - 90)),
)
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      ref="box"
      class="relative w-full select-none outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-primary/50"
      :style="{ height: `${height}px` }"
      tabindex="0"
      role="img"
      :aria-label="summary"
      @keydown="onKey"
      @pointerleave="active = null"
      @blur="active = null"
    >
      <svg v-if="width" :width="width" :height="height" class="block overflow-visible" aria-hidden="true">
        <g v-for="tick in ticks" :key="tick">
          <line
            :x1="pad.left"
            :x2="width - pad.right"
            :y1="y(tick)"
            :y2="y(tick)"
            stroke="var(--chart-grid)"
            :stroke-dasharray="tick === 0 ? undefined : '3 3'"
          />
          <text :x="pad.left - 8" :y="y(tick)" text-anchor="end" dominant-baseline="middle" class="fill-(--ui-text-muted) text-[11px] tabular-nums">
            {{ format(tick) }}
          </text>
        </g>
        <g v-for="(bar, index) in bars" :key="bar.label" @pointerenter="active = index" @pointerdown="active = index">
          <rect :x="pad.left + slot * index" :y="pad.top" :width="slot" :height="innerHeight" fill="transparent" />
          <rect
            v-if="active === index"
            :x="pad.left + slot * index + 2"
            :y="pad.top"
            :width="Math.max(0, slot - 4)"
            :height="innerHeight"
            rx="4"
            fill="var(--chart-grid)"
            fill-opacity="0.5"
          />
          <rect
            v-for="segment in rects[index]"
            :key="segment.name"
            :x="barX(index)"
            :y="segment.top"
            :width="barWidth"
            :height="segment.height"
            :fill="segment.color"
            rx="2"
          />
          <text
            :x="barX(index) + barWidth / 2"
            :y="height - 6"
            text-anchor="middle"
            class="fill-(--ui-text-muted) text-[11px]"
          >
            {{ width < 520 && bars.length > 6 ? (index % 2 === 0 ? bar.label : "") : bar.label }}
          </text>
        </g>
      </svg>
      <div
        v-if="current"
        class="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-md border border-default bg-default p-2.5 shadow-xs"
        :style="{ left: `${tooltipLeft}px` }"
        aria-live="polite"
      >
        <p class="mb-1.5 text-xs font-medium text-highlighted">{{ current.label }}</p>
        <p v-for="segment in current.segments" :key="segment.name" class="flex items-center gap-2 text-xs">
          <span class="size-2 shrink-0 rounded-xs" :style="{ background: segment.color }" />
          <span class="flex-1 truncate text-muted">{{ segment.name }}</span>
          <span class="money text-highlighted">{{ format(segment.value) }}</span>
        </p>
      </div>
    </div>
    <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
      <li v-for="item in legend" :key="item.name" class="flex items-center gap-1.5">
        <span class="size-2 rounded-xs" :style="{ background: item.color }" aria-hidden="true" />{{ item.name }}
      </li>
    </ul>
  </div>
</template>
