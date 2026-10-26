<script setup lang="ts">
// Joxi's mark (the favicon's J on its tile) and, unless `markOnly`, the name.
defineProps<{ markOnly?: boolean }>()
</script>

<template>
  <span class="inline-flex items-center gap-2 font-semibold text-highlighted">
    <svg viewBox="0 0 32 32" class="size-6 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="8" class="fill-(--ui-text-highlighted)" />
      <path d="M19 8v11.5a4.5 4.5 0 0 1-9 0" fill="none" class="stroke-(--ui-bg)" stroke-width="3" stroke-linecap="round" />
    </svg>
    <span v-if="!markOnly" class="text-sm">Joxi</span>
  </span>
</template>
