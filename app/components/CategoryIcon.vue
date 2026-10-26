<script setup lang="ts">
// A category's icon on its tinted tile. Uncategorized reads as a dashed, neutral tile.
const props = withDefaults(defineProps<{ icon?: string | null; color?: string | null; size?: "sm" | "md" | "lg" }>(), {
  size: "md",
})
const classes = computed(() => categoryColor(props.icon ? props.color : "neutral").soft)
</script>

<template>
  <span
    class="grid shrink-0 place-items-center"
    :class="[
      classes,
      size === 'sm' ? 'size-6 rounded-md' : size === 'lg' ? 'size-10 rounded-lg' : 'size-8 rounded-md',
      !icon && 'border border-dashed border-default bg-transparent',
    ]"
    aria-hidden="true"
  >
    <UIcon :name="icon || 'i-lucide-circle-help'" :class="size === 'sm' ? 'size-3.5' : size === 'lg' ? 'size-5' : 'size-4'" />
  </span>
</template>
