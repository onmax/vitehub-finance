<script setup lang="ts">
// Progress as a ring with the percentage inside. The track is the chart grid color; the arc the chart line's.
const props = withDefaults(defineProps<{ value: number; size?: number; label: string }>(), { size: 72 })
const stroke = 6
const radius = computed(() => (props.size - stroke) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const clamped = computed(() => Math.min(1, Math.max(0, props.value)))
</script>

<template>
  <div class="relative shrink-0" :style="{ width: `${size}px`, height: `${size}px` }" role="img" :aria-label="label">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" class="-rotate-90" aria-hidden="true">
      <circle :cx="size / 2" :cy="size / 2" :r="radius" fill="none" stroke="var(--chart-grid)" :stroke-width="stroke" />
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        stroke="var(--chart-line)"
        :stroke-width="stroke"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="circumference * (1 - clamped)"
        class="transition-[stroke-dashoffset] duration-200 motion-reduce:transition-none"
        :opacity="clamped === 0 ? 0 : 1"
      />
    </svg>
    <span class="absolute inset-0 grid place-items-center text-sm font-medium text-highlighted tabular-nums">
      {{ formatPercent(value) }}
    </span>
  </div>
</template>
