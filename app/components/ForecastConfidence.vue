<script setup lang="ts">
import type { ForecastSeries } from "#shared/api"

// How sure the forecast is of a payment: three dots and a word, the reason in a tooltip and for screen readers.
const props = defineProps<{ series: Pick<ForecastSeries, "confidence" | "occurrences" | "dayRange" | "amountRange" | "status" | "cadence"> }>()
const level = computed(() => CONFIDENCE[props.series.confidence])
const reason = computed(() => confidenceReason(props.series))
</script>

<template>
  <UTooltip :text="reason">
    <span tabindex="0" class="inline-flex items-center gap-1.5 rounded-sm text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/50" :class="level.class">
      <span class="flex gap-0.5" aria-hidden="true">
        <span v-for="dot in 3" :key="dot" class="size-1.5 rounded-full" :class="dot <= level.dots ? 'bg-current' : 'bg-current opacity-20'" />
      </span>
      {{ level.label }}<span class="sr-only">: {{ reason }}</span>
    </span>
  </UTooltip>
</template>
