<script setup lang="ts">
// ViteHub Finance's mark (the favicon's F on its tile) and, unless `markOnly`, the name.
defineProps<{ markOnly?: boolean }>()
</script>

<template>
  <span class="inline-flex items-center gap-2 font-semibold text-highlighted">
    <svg viewBox="0 0 32 32" class="size-6 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="8" class="fill-(--ui-color-primary-600)" />
      <path d="M12 24V8h9M12 16h7" fill="none" class="stroke-white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span v-if="!markOnly" class="text-sm">ViteHub Finance</span>
  </span>
</template>
