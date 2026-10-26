<script setup lang="ts">
import type { ForecastMonth } from "#shared/api"
import { scaleBand, scaleLinear } from "d3-scale"

// Months as bars around zero: income up; bills, everyday spending, money moved out, and a what-if's one-off stacked
// down; a mark at what's left (net). Picking a month (pointer, Enter, or the arrow keys) explains it next to the chart.
const props = withDefaults(
  defineProps<{ months: ForecastMonth[]; today: string; format: (minor: number) => string; height?: number }>(),
  { height: 240 },
)
const selected = defineModel<number>({ required: true })

const box = useTemplateRef<HTMLElement>("box")
const { width } = useElementSize(box)
const narrow = computed(() => width.value < 520)
const pad = computed(() => ({ top: 12, right: 4, bottom: 22, left: narrow.value ? 44 : 56 }))

const parts = (month: ForecastMonth) => [
  { key: "bills" as const, value: month.billsMinor },
  { key: "variable" as const, value: month.variableOutMinor },
  { key: "moved" as const, value: Math.max(0, month.movedOutMinor) },
  { key: "oneOff" as const, value: month.oneOffMinor },
]
const x = computed(() =>
  scaleBand<number>()
    .domain(props.months.map((_, index) => index))
    .range([pad.value.left, Math.max(pad.value.left + 1, width.value - pad.value.right)])
    .paddingInner(narrow.value ? 0.25 : 0.35)
    .paddingOuter(0.15),
)
const y = computed(() => {
  const up = Math.max(1, ...props.months.map((month) => month.incomeMinor + Math.max(0, -month.movedOutMinor)))
  const down = Math.max(0, ...props.months.map((month) => parts(month).reduce((sum, part) => sum + part.value, 0)))
  return scaleLinear()
    .domain([-down, up])
    .range([props.height - pad.value.bottom, pad.value.top])
    .nice(4)
})
const ticks = computed(() => y.value.ticks(narrow.value ? 3 : 5))
const bars = computed(() =>
  props.months.map((month, index) => {
    let floor = 0
    const down = parts(month)
      .filter((part) => part.value > 0)
      .map((part) => {
        const top = y.value(-floor)
        floor += part.value
        return { key: part.key, y: top, height: Math.max(1, y.value(-floor) - top) }
      })
    // Money moved in from elsewhere (more than went out) stacks on top of income.
    let ceiling = 0
    const up = [
      { key: "income" as const, value: month.incomeMinor },
      { key: "moved" as const, value: Math.max(0, -month.movedOutMinor) },
    ]
      .filter((part) => part.value > 0)
      .map((part) => {
        const bottom = y.value(ceiling)
        ceiling += part.value
        return { key: part.key, y: y.value(ceiling), height: Math.max(1, bottom - y.value(ceiling)) }
      })
    return {
      index,
      x: x.value(index)!,
      up,
      down,
      net: y.value(month.netMinor),
      label: forecastMonthTick(`${month.month}-01`, props.today),
    }
  }),
)

function onKey(event: KeyboardEvent) {
  const last = props.months.length - 1
  const moves: Record<string, number> = { ArrowLeft: selected.value - 1, ArrowRight: selected.value + 1, Home: 0, End: last }
  if (!(event.key in moves)) return
  event.preventDefault()
  selected.value = Math.min(last, Math.max(0, moves[event.key]!))
}
const summary = computed(
  () =>
    `Income and spending by month. ${props.months
      .map((month) => `${month.label}: in ${props.format(month.incomeMinor)}, out ${props.format(month.billsMinor + month.variableOutMinor + month.movedOutMinor + month.oneOffMinor)}, net ${props.format(month.netMinor)}`)
      .join("; ")}. Use the arrow keys to pick a month.`,
)
</script>

<template>
  <div
    ref="box"
    class="relative w-full select-none outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-primary/50"
    :style="{ height: `${height}px` }"
    tabindex="0"
    role="group"
    aria-roledescription="chart"
    :aria-label="summary"
    @keydown="onKey"
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
          :stroke="tick === 0 ? 'var(--ui-border-accented)' : 'var(--chart-grid)'"
          :stroke-dasharray="tick === 0 ? undefined : '2 4'"
        />
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
      </g>
      <g v-for="bar in bars" :key="bar.index" class="cursor-pointer" @pointerenter="selected = bar.index" @pointerdown="selected = bar.index">
        <rect
          :x="bar.x - x.step() * x.paddingInner() / 2"
          :y="pad.top"
          :width="x.step()"
          :height="height - pad.top - pad.bottom"
          rx="4"
          :class="selected === bar.index ? 'fill-primary/8 dark:fill-primary/12' : 'fill-transparent'"
        />
        <rect v-for="part in bar.up" :key="part.key" :x="bar.x" :y="part.y" :width="x.bandwidth()" :height="part.height" :class="FLOW[part.key].fill" />
        <rect v-for="part in bar.down" :key="part.key" :x="bar.x" :y="part.y" :width="x.bandwidth()" :height="part.height" :class="FLOW[part.key].fill" />
        <line :x1="bar.x - 3" :x2="bar.x + x.bandwidth() + 3" :y1="bar.net" :y2="bar.net" stroke="var(--chart-line)" stroke-width="2.5" stroke-linecap="round" />
        <text :x="bar.x + x.bandwidth() / 2" :y="height - 4" text-anchor="middle" class="text-[11px]" :class="selected === bar.index ? 'fill-(--ui-text-highlighted) font-medium' : 'fill-(--ui-text-muted)'">
          {{ narrow && months.length > 6 && bar.index % 2 ? "" : bar.label }}
        </text>
      </g>
    </svg>
  </div>
</template>
