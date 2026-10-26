<script setup lang="ts">
// A counterparty's initials on a quiet tile, like Mercury's transaction rows.
const props = withDefaults(defineProps<{ name: string; size?: "sm" | "md" }>(), { size: "md" })
const letters = computed(() => initials(props.name))
</script>

<template>
  <span
    class="grid shrink-0 place-items-center rounded-md bg-elevated font-medium text-toned"
    :class="size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-xs'"
    aria-hidden="true"
    >{{ letters }}</span
  >
</template>
