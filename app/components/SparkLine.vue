<script setup lang="ts">
// A tiny trend line for a list row, in the text color it sits in.
const props = withDefaults(defineProps<{ values: number[]; width?: number; height?: number; label: string }>(), {
  width: 64,
  height: 20,
})
const path = computed(() => {
  const list = props.values
  if (list.length < 2) return ""
  const min = Math.min(...list)
  const max = Math.max(...list)
  const span = max - min || 1
  return list
    .map((value, index) => {
      const px = (index / (list.length - 1)) * (props.width - 2) + 1
      const py = props.height - 1 - ((value - min) / span) * (props.height - 2)
      return `${index ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`
    })
    .join("")
})
</script>

<template>
  <svg :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" role="img" :aria-label="label" class="shrink-0">
    <path :d="path" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
  </svg>
</template>
