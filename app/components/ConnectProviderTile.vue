<script setup lang="ts">
import type { Availability, CatalogProvider } from "~/utils/connect-catalog"

// One provider in the catalog: its mark, name, site, one line, and its state in words. The whole tile opens its details;
// a connectable one also has a Connect button that skips straight to the dialog.
const props = defineProps<{ entry: CatalogProvider; availability: Availability }>()
defineEmits<{ open: []; connect: [] }>()
const state = computed(() => AVAILABILITY[props.availability])
const connectable = computed(() => props.availability === "available" || props.availability === "connected")
</script>

<template>
  <li
    :id="`provider-${entry.id}`"
    class="group relative flex flex-col sm:min-h-36 gap-3 rounded-lg border border-default p-4 transition-colors duration-150 hover:bg-elevated/50 has-[button.tile-open:focus-visible]:outline-2 has-[button.tile-open:focus-visible]:outline-primary"
  >
    <div class="flex items-start gap-3">
      <InstitutionMark :provider="entry.provider" :name="entry.name" :plain="entry.soon" />
      <div class="min-w-0 flex-1">
        <h3 class="text-sm font-medium text-highlighted">
          <button type="button" class="tile-open cursor-pointer text-left outline-none after:absolute after:inset-0 after:rounded-lg" @click="$emit('open')">
            {{ entry.name }}
          </button>
        </h3>
        <p class="truncate font-mono text-[11px] text-muted">{{ entry.domain }}</p>
      </div>
      <span class="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] font-medium tracking-wider text-muted uppercase">
        <span v-if="state.dot" class="size-1.5 rounded-full" :class="state.dot" aria-hidden="true" />{{ state.label }}
      </span>
    </div>
    <p class="line-clamp-2 text-sm text-pretty text-muted">{{ entry.description }}</p>
    <div v-if="connectable" class="relative z-10 mt-auto">
      <UButton
        size="sm"
        color="neutral"
        variant="outline"
        :icon="availability === 'connected' ? 'i-lucide-plus' : undefined"
        :label="availability === 'connected' ? $t('catalogAddAnother') : $t('connect2')"
        :aria-label="$t('connect', { value1: entry.name })"
        @click="$emit('connect')"
      />
    </div>
  </li>
</template>
