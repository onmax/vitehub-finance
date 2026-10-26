<script setup lang="ts" generic="T extends string | number">
// shadcn's ToggleGroup: one choice of a few, as a row of buttons on a muted track.
defineProps<{ options: Array<{ value: T; label: string; icon?: string }>; label: string; size?: "sm" | "md" }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div role="radiogroup" :aria-label="label" class="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-elevated p-0.5">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      class="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 font-medium transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
      :class="[
        size === 'sm' ? 'h-7 text-xs' : 'h-8 text-sm',
        model === option.value ? 'bg-default text-highlighted shadow-xs ring ring-default' : 'text-muted hover:text-highlighted',
      ]"
      @click="model = option.value"
    >
      <UIcon v-if="option.icon" :name="option.icon" class="size-3.5" />
      {{ option.label }}
    </button>
  </div>
</template>
