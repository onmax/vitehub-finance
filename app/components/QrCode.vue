<script setup lang="ts">
import { encode } from "~/lib/uqr"

// A QR code as one SVG path, dark modules on white in both themes so every camera reads it.
const props = defineProps<{ value: string; label: string }>()
const qr = computed(() => encode(props.value, { ecc: "M", border: 2 }))
const path = computed(() => {
  let d = ""
  qr.value.data.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x} ${y}h1v1h-1z`)))
  return d
})
</script>

<template>
  <svg
    :viewBox="`0 0 ${qr.size} ${qr.size}`"
    class="rounded-lg bg-white"
    role="img"
    :aria-label="label"
    shape-rendering="crispEdges"
  >
    <path :d="path" fill="#09090b" />
  </svg>
</template>
