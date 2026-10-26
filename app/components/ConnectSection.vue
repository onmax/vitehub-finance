<script setup lang="ts">
// One way to bring money in, flat: a hairline above it, an icon, a title, one line about it, then the form.
defineProps<{ icon: string; title: string; description: string }>()
</script>

<template>
  <section class="flex scroll-mt-4 flex-col gap-4 border-t border-default pt-5" :aria-label="title">
    <header class="flex items-start gap-3">
      <span class="grid size-8 shrink-0 place-items-center rounded-md bg-elevated text-toned">
        <UIcon :name="icon" class="size-4" />
      </span>
      <div class="min-w-0 flex-1">
        <h3 class="text-sm font-semibold text-highlighted">{{ title }}</h3>
        <p class="mt-0.5 text-sm text-pretty text-muted">{{ description }}</p>
      </div>
      <slot name="actions" />
    </header>
    <div v-if="$slots.default">
      <slot />
    </div>
  </section>
</template>
