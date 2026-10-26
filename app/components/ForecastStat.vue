<script setup lang="ts">
// One figure in the forecast's summary row: a label, the amount, and a line of context under it.
defineProps<{ label: string; minor: number; currency: string; note?: string; tone?: "in" | "none" }>()
</script>

<template>
  <div class="rounded-xl border border-default bg-default p-4 shadow-xs">
    <p class="text-sm text-muted">{{ label }}</p>
    <p class="mt-1 text-xl font-semibold sm:text-2xl tracking-[-0.02em] text-highlighted">
      <Money :minor="minor" :currency="currency" :tone="tone" compact />
    </p>
    <p v-if="note" class="mt-1 text-xs text-muted tabular-nums">{{ note }}</p>
  </div>
</template>
