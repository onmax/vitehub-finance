<script setup lang="ts">
// A dashboard section, flat: a hairline on top, a quiet title, an optional link to the full view, and its content.
defineProps<{ title: string; to?: string; linkLabel?: string; bodyClass?: string }>()
const id = useId()
</script>

<template>
  <section class="flex min-w-0 flex-col border-t border-default" :aria-labelledby="id">
    <header class="flex h-11 items-center justify-between gap-2">
      <h2 :id="id" class="text-sm font-medium text-highlighted">{{ title }}</h2>
      <slot name="action">
        <UButton
          v-if="to"
          :to="to"
          :label="linkLabel ?? $t('seeAll')"
          color="neutral"
          variant="link"
          size="sm"
          trailing-icon="i-lucide-arrow-right"
          class="-me-1.5 text-muted"
        />
      </slot>
    </header>
    <div class="flex min-h-0 flex-1 flex-col pt-1" :class="bodyClass">
      <slot />
    </div>
  </section>
</template>
