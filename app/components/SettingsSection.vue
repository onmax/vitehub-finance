<script setup lang="ts">
// A settings section, flat: a hairline above it (none on the page's first; settings.vue drops it when a form wraps it), a title and one line about it with its actions on
// the right, then the body and its footer actions. `flush` bodies are lists whose rows bring their own rhythm.
defineProps<{ title: string; description?: string; flush?: boolean }>()
const id = useId()
</script>

<template>
  <section class="flex flex-col gap-4 border-t border-default pt-6 [&:first-child:not(form>*)]:border-t-0 [&:first-child:not(form>*)]:pt-0" :aria-labelledby="id">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h2 :id="id" class="text-base font-semibold text-highlighted">{{ title }}</h2>
          <slot name="badge" />
        </div>
        <p v-if="description" class="mt-1 max-w-prose text-sm text-muted">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <div :class="flush ? '-mt-1' : ''">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="flex items-center justify-end gap-2">
      <slot name="footer" />
    </footer>
  </section>
</template>
