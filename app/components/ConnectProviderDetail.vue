<script setup lang="ts">
import type { Availability, CatalogProvider } from "~/utils/connect-catalog"

// One provider's page, as a slideover: what it is, its state, what it reads, what it can't do, how it signs in, and its
// own docs, with one action at the bottom (Executor's integration detail and Codex plugin card). A platform that can't
// be connected yet says so and offers the CSV import instead.
const props = defineProps<{ entry: CatalogProvider; availability: Availability }>()
const open = defineModel<boolean>("open", { default: false })
defineEmits<{ connect: []; import: [] }>()
const state = computed(() => AVAILABILITY[props.availability])
const status = computed(() => {
  if (props.availability === "soon") return translate('catalogSoonStatus', { name: props.entry.name })
  if (props.availability === "setup") return translate('catalogSetupStatus')
  if (props.availability === "connected") return translate('catalogConnectedStatus')
  return translate('catalogAvailableStatus')
})
</script>

<template>
  <USlideover v-model:open="open" :ui="{ content: 'max-w-md', body: 'flex flex-col gap-6', footer: 'justify-end gap-2' }">
    <template #title>
      <span class="flex items-center gap-3">
        <InstitutionMark :provider="entry.provider" :name="entry.name" :plain="entry.soon" size="lg" />
        <span class="min-w-0">
          <span class="block text-base font-semibold text-highlighted">{{ entry.name }}</span>
          <span class="block font-mono text-[11px] font-normal tracking-wider text-muted uppercase">{{ CONNECT_KINDS[entry.kind].one }}</span>
        </span>
      </span>
    </template>
    <template #description>
      <span class="sr-only">{{ entry.description }}</span>
    </template>

    <template #body>
      <div class="flex flex-col gap-1.5">
        <p class="text-sm text-pretty text-toned">{{ entry.description }}</p>
        <ULink :to="`https://${entry.domain}`" target="_blank" rel="noopener" class="inline-flex items-center gap-1 self-start font-mono text-xs text-muted hover:text-highlighted">
          {{ entry.domain }}<UIcon name="i-lucide-arrow-up-right" class="size-3" />
        </ULink>
      </div>

      <div class="flex flex-col gap-1.5 rounded-lg border border-default px-3 py-2.5">
        <div class="flex items-baseline justify-between gap-3">
          <span class="font-mono text-[11px] font-medium tracking-wider text-muted uppercase">{{ $t('catalogStatus') }}</span>
          <span class="inline-flex items-center gap-1.5 font-mono text-[11px] text-highlighted uppercase">
            <span v-if="state.dot" class="size-1.5 rounded-full" :class="state.dot" aria-hidden="true" />{{ state.label }}
          </span>
        </div>
        <p class="text-sm text-pretty text-muted">{{ status }}</p>
      </div>

      <ConnectFacts v-if="!entry.soon" :entry="entry" />

      <ULink v-if="entry.docs" :to="entry.docs" target="_blank" rel="noopener" class="inline-flex items-center gap-1 self-start text-sm font-medium text-highlighted underline-offset-4 hover:underline">
        {{ $t('catalogDocs', { name: entry.name }) }}<UIcon name="i-lucide-arrow-up-right" class="size-3.5" />
      </ULink>
    </template>

    <template #footer>
      <UButton v-if="entry.soon" color="neutral" variant="outline" icon="i-lucide-file-up" :label="$t('catalogImportACsvInstead')" @click="$emit('import')" />
      <UButton
        v-else-if="availability !== 'setup'"
        :icon="availability === 'connected' ? 'i-lucide-plus' : undefined"
        :label="availability === 'connected' ? $t('catalogConnectAnother', { name: entry.name }) : $t('connect', { value1: entry.name })"
        @click="$emit('connect')"
      />
    </template>
  </USlideover>
</template>
