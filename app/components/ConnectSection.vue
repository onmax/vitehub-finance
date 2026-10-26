<script setup lang="ts">
// One way to bring money into Joxi, as a card: an icon, a title, one line about it, then the form.
defineProps<{ icon: string; title: string; description: string }>()
</script>

<template>
  <section class="scroll-mt-4 rounded-xl border border-default bg-default shadow-xs" :aria-label="title">
    <header class="flex items-start gap-3 px-4 pt-4 sm:px-5 sm:pt-5" :class="!$slots.default && 'pb-4 sm:pb-5'">
      <span class="grid size-9 shrink-0 place-items-center rounded-lg border border-default bg-elevated">
        <UIcon :name="icon" class="size-4.5 text-toned" />
      </span>
      <div class="min-w-0 flex-1">
        <h3 class="text-sm font-semibold text-highlighted">{{ title }}</h3>
        <p class="mt-0.5 text-sm text-muted">{{ description }}</p>
      </div>
      <slot name="actions" />
    </header>
    <div v-if="$slots.default" class="p-4 sm:p-5">
      <slot />
    </div>
  </section>
</template>
