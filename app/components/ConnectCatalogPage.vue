<script setup lang="ts">
import type { ProviderInfo } from "#shared/api"
import type { CatalogProvider, ConnectPage } from "~/utils/connect-catalog"

// /connect/crypto and /connect/investments: the household's connections of that kind first, then the catalog. A tile
// opens its details (`#<id>`) or its connect dialog (`#<id>/connect`); leaving the dialog's success screen lands on the
// new connection in the list above.
const props = defineProps<{ page: ConnectPage; listTitle: string; aliases?: Record<string, string> }>()
const { connections, status, error, refresh, highlight, linked, land } = useConnectPage(props.page)
const routes = useConnectRoutes(props.page, props.aliases)
const { addManual, importCsv } = useAccountAdders()
const { data: providers } = useScopedFetch<ProviderInfo[]>("/api/connect/providers", { key: "providers", unscoped: true, default: () => [] })

// The overlays keep showing their provider while they animate closed; each opening of the dialog starts it afresh.
const detailEntry = shallowRef<CatalogProvider | null>(null)
const dialogEntry = shallowRef<CatalogProvider | null>(null)
const dialogKey = ref(0)
watch(routes.detail, (entry) => entry && (detailEntry.value = entry), { immediate: true })
watch(routes.dialog, (entry) => entry && ((dialogEntry.value = entry), dialogKey.value++), { immediate: true })
const detailOpen = computed({ get: () => routes.detail.value !== null, set: (value) => !value && routes.close() })
const dialogOpen = computed({ get: () => routes.dialog.value !== null, set: (value) => !value && routes.close() })

async function importInstead() {
  routes.close()
  await importCsv()
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-10">
    <section v-if="error || connections.length || status === 'pending'" aria-labelledby="connections-title" class="flex flex-col gap-1">
      <div class="flex items-baseline justify-between gap-3">
        <h2 id="connections-title" class="text-sm font-medium text-highlighted">{{ listTitle }}</h2>
        <p v-if="connections.length" class="text-xs text-muted">{{ $t('syncedDaily') }}</p>
      </div>
      <PageError v-if="error" :error="error" :title="$t('couldnTLoadYourConnections')" @retry="refresh()" />
      <ConnectionList v-else :connections="connections" :loading="status === 'pending'" :highlight="highlight" @changed="refresh()" />
    </section>

    <ConnectCatalog :page="page" :connections="connections" @open="routes.openDetail" @connect="routes.openConnect" @import="importCsv" @manual="addManual" />

    <slot name="footer" />

    <ConnectProviderDetail
      v-if="detailEntry"
      v-model:open="detailOpen"
      :entry="detailEntry"
      :availability="availabilityOf(detailEntry, providers, connections)"
      @connect="routes.openConnect(detailEntry)"
      @import="importInstead"
    />
    <ConnectDialog v-if="dialogEntry" :key="dialogKey" v-model:open="dialogOpen" :entry="dialogEntry" @connected="linked" @done="land" />
  </div>
</template>
