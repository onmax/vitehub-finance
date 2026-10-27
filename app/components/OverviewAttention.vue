<script setup lang="ts">
import type { ConnectionSummary } from "#shared/api"

// Connections that need someone: consent running out, expired, or failing. Reconnecting a bank opens its sign-in.
const props = defineProps<{ connections: ConnectionSummary[] }>()
const notify = useNotify()
const pending = ref<string | null>(null)

function reason(connection: ConnectionSummary) {
  if (connection.status === "error") return (connection.lastError && providerErrorText(connection.lastError, connection.lastErrorCode)) || translate('theLastSyncFailedTryAgain')
  if (connection.status === "expired") return translate('theBankSConsentExpiredReconnectToKeepSyncing')
  if (connection.consentExpiresAt) return translate('consentEndsReconnectBeforeThenToKeepSyncing', { value1: formatDate(connection.consentExpiresAt) })
  return translate('checkThisConnection')
}

async function reconnect(connection: ConnectionSummary) {
  pending.value = connection.id
  try {
    if (connection.provider === "enable_banking") {
      const { url } = await $fetch<{ url: string }>(`/api/connections/${connection.id}/reconnect`, { method: "POST" })
      window.location.href = url
      return
    }
    await $fetch(`/api/connections/${connection.id}/sync`, { method: "POST" })
    notify.success(translate('synced2'), connection.name)
    await refreshStems("overview", "accounts", "connections")
  } catch (error) {
    notify.error(error, connection.provider === "enable_banking" ? translate('couldnTReconnect', { value1: connection.name }) : translate('couldnTSync', { value1: connection.name }))
  } finally {
    pending.value = null
  }
}
const items = computed(() => props.connections)
</script>

<template>
  <section aria-labelledby="attention-title" class="rounded-lg bg-warning/8 px-4 dark:bg-warning/10">
    <h2 id="attention-title" class="flex h-10 items-center gap-2 text-sm font-medium text-highlighted">
      <UIcon name="i-lucide-triangle-alert" class="size-4 text-warning" aria-hidden="true" /> {{ $t('needsAttention') }} </h2>
    <ul class="divide-y divide-warning/15">
      <li v-for="connection in items" :key="connection.id" class="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
        <InstitutionMark :provider="connection.provider" :name="connection.institution ?? connection.name" :logo="connection.logo" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-highlighted">{{ connection.institution ?? connection.name }}</span>
          <span class="block text-sm text-toned">{{ reason(connection) }}</span>
        </span>
        <DemoLock v-if="connection.canManage" v-slot="{ locked }">
          <UButton
            color="neutral"
            variant="outline"
            :icon="connection.provider === 'enable_banking' ? 'i-lucide-link' : 'i-lucide-refresh-cw'"
            :label="connection.provider === 'enable_banking' ? $t('reconnect') : $t('tryAgain')"
            :loading="pending === connection.id"
            :disabled="locked"
            class="bg-default"
            @click="reconnect(connection)"
          />
        </DemoLock>
        <span v-else class="text-xs text-muted">{{ $t('canReconnectIt', { value1: connection.ownerName }) }}</span>
      </li>
    </ul>
  </section>
</template>
