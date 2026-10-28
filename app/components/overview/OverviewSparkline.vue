<script setup lang="ts">
import { line } from "d3-shape"

const props = defineProps<{ values: Array<number | null>; label: string }>()
const path = computed(() => {
  const known = props.values.filter((value) => value !== null)
  if (known.length < 2) return null
  const min = Math.min(...known)
  const max = Math.max(...known)
  return line<number | null>()
    .defined((value) => value !== null)
    .x((_, index) => 2 + index / Math.max(1, props.values.length - 1) * 296)
    .y((value) => max === min ? 24 : 42 - ((value ?? min) - min) / (max - min) * 36)(props.values)
})
</script>

<template>
  <svg v-if="path" viewBox="0 0 300 48" preserveAspectRatio="none" class="h-10 w-full sm:h-12 text-muted" role="img" :aria-label="label">
    <path :d="path" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
  </svg>
  <p v-else class="flex h-10 items-end sm:h-12 text-xs text-muted">{{ $t('overviewTrendNeedsHistory') }}</p>
</template>
