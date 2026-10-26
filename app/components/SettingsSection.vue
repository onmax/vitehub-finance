<script setup lang="ts">
// A settings card: a title and one line about it on the left of the header, its actions on the right, then the body.
defineProps<{ title: string; description?: string; flush?: boolean }>()
const id = useId()
</script>

<template>
  <section class="rounded-xl border border-default bg-default shadow-xs" :aria-labelledby="id">
    <header class="flex flex-col gap-3 border-b border-default px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h2 :id="id" class="text-sm font-semibold text-highlighted">{{ title }}</h2>
          <slot name="badge" />
        </div>
        <p v-if="description" class="mt-1 text-sm text-muted">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <div :class="flush ? '' : 'p-4 sm:p-5'">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="flex items-center justify-end gap-2 border-t border-default bg-muted/50 px-4 py-3 sm:px-5 rounded-b-xl">
      <slot name="footer" />
    </footer>
  </section>
</template>
