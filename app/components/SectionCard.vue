<script setup lang="ts">
// A dashboard card: a quiet title, an optional link to the full view, and its content.
defineProps<{ title: string; to?: string; linkLabel?: string; bodyClass?: string }>()
</script>

<template>
  <section class="flex min-w-0 flex-col rounded-xl border border-default bg-default shadow-xs">
    <header class="flex h-12 items-center justify-between gap-2 px-4 sm:px-5">
      <h2 class="text-sm font-medium text-muted">{{ title }}</h2>
      <slot name="action">
        <UButton
          v-if="to"
          :to="to"
          :label="linkLabel ?? 'See all'"
          color="neutral"
          variant="ghost"
          size="sm"
          trailing-icon="i-lucide-arrow-right"
          class="-me-2 text-muted"
        />
      </slot>
    </header>
    <div class="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-5 sm:pb-5" :class="bodyClass">
      <slot />
    </div>
  </section>
</template>
