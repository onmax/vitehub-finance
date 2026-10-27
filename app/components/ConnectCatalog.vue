<script setup lang="ts">
import type { ConnectionSummary, ProviderInfo } from "#shared/api"
import type { CatalogProvider, ConnectKind, ConnectPage } from "~/utils/connect-catalog"

// A page's catalog: search first, kind chips under it, then the providers as tiles grouped by kind (each group is a
// section anchor, `#exchange`, `#wallet`). Searching flattens the groups. Below everything, and leading an empty search,
// the way in for what isn't listed: a CSV import or a manual account (Executor's "Add custom" door).
const props = defineProps<{ page: ConnectPage; connections: ConnectionSummary[] }>()
defineEmits<{ open: [entry: CatalogProvider]; connect: [entry: CatalogProvider]; import: []; manual: [] }>()

const { data: providers } = useScopedFetch<ProviderInfo[]>("/api/connect/providers", { key: "providers", unscoped: true, default: () => [] })
const entries = computed(() => catalogFor(props.page))
const kinds = computed(() => [...new Set(entries.value.map((entry) => entry.kind))])
const kind = ref<ConnectKind | "all">("all")
const search = ref("")
const availability = (entry: CatalogProvider) => availabilityOf(entry, providers.value, props.connections)

const matching = computed(() => entries.value.filter((entry) => (kind.value === "all" || entry.kind === kind.value) && matchesSearch(entry, search.value)))
// Connectable first, then what's coming, in catalog order.
const ordered = computed(() => [...matching.value].sort((a, b) => Number(Boolean(a.soon)) - Number(Boolean(b.soon))))
const groups = computed(() =>
  search.value.trim()
    ? [{ kind: null, entries: ordered.value }]
    : kinds.value.map((value) => ({ kind: value, entries: ordered.value.filter((entry) => entry.kind === value) })).filter((group) => group.entries.length),
)
const chips = computed(() => [
  { value: "all" as const, label: translate('all') },
  ...kinds.value.map((value) => ({ value, label: CONNECT_KINDS[value].label })),
])
</script>

<template>
  <section class="flex flex-col gap-4" :aria-label="$t('catalogAddAConnection')">
    <div class="flex flex-col gap-3">
      <h2 class="text-sm font-medium text-highlighted">{{ $t('catalogAddAConnection') }}</h2>
      <UInput v-model="search" icon="i-lucide-search" size="lg" :placeholder="$t('catalogSearch')" :aria-label="$t('catalogSearch')" class="w-full" />
      <div v-if="kinds.length > 1" class="flex flex-wrap gap-1.5" role="radiogroup" :aria-label="$t('catalogFilter')">
        <button
          v-for="chip in chips"
          :key="chip.value"
          type="button"
          role="radio"
          :aria-checked="kind === chip.value"
          class="h-7 cursor-pointer rounded-full border px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary"
          :class="kind === chip.value ? 'border-transparent bg-inverted text-inverted' : 'border-default text-muted hover:bg-elevated hover:text-highlighted'"
          @click="kind = chip.value"
        >
          {{ chip.label }}
        </button>
      </div>
    </div>

    <p v-if="!matching.length" class="text-sm text-muted">{{ $t('catalogNoMatch', { term: search.trim() }) }}</p>
    <section v-for="group in groups" :id="group.kind ?? undefined" :key="group.kind ?? 'results'" class="flex scroll-mt-4 flex-col gap-2" :aria-label="group.kind ? CONNECT_KINDS[group.kind].label : $t('catalogResults')">
      <h3 v-if="group.kind && kinds.length > 1" class="font-mono text-[11px] font-medium tracking-wider text-muted uppercase">{{ CONNECT_KINDS[group.kind].label }}</h3>
      <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <ConnectProviderTile
          v-for="entry in group.entries"
          :key="entry.id"
          :entry="entry"
          :availability="availability(entry)"
          @open="$emit('open', entry)"
          @connect="$emit('connect', entry)"
        />
      </ul>
    </section>

    <div class="flex flex-col gap-3 rounded-lg border border-dashed border-default p-4 sm:flex-row sm:items-center">
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-highlighted">{{ $t('catalogNotListed') }}</p>
        <p class="mt-0.5 text-sm text-pretty text-muted">{{ $t('catalogNotListedHelp') }}</p>
      </div>
      <div class="flex shrink-0 gap-2">
        <UButton color="neutral" variant="outline" icon="i-lucide-file-up" :label="$t('importACsv')" @click="$emit('import')" />
        <UButton color="neutral" variant="ghost" icon="i-lucide-plus" :label="$t('manualAccount')" @click="$emit('manual')" />
      </div>
    </div>
  </section>
</template>
