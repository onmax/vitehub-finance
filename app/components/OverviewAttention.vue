<script setup lang="ts">
import type { ConnectionSummary } from "#shared/api"

// Connections that need someone: consent running out, expired, or failing. Reconnecting a bank opens its sign-in.
const props = defineProps<{ connections: ConnectionSummary[] }>()
const notify = useNotify()
const pending = ref<string | null>(null)

function reason(connection: ConnectionSummary) {
  if (connection.status === "error") return connection.lastError ? `Sync failed: ${connection.lastError}` : "The last sync failed."
  if (connection.status === "expired") return "The bank’s consent expired. Reconnect to keep syncing."
  if (connection.consentExpiresAt) return `Consent ends ${formatDate(connection.consentExpiresAt)}. Reconnect before then to keep syncing.`
  return "This connection needs a look."
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
    notify.success("Synced", connection.name)
    await refreshStems("overview", "accounts", "connections")
  } catch (error) {
    notify.error(error, "Couldn’t reconnect")
  } finally {
    pending.value = null
  }
}
const items = computed(() => props.connections)
</script>

<template>
  <section aria-labelledby="attention-title" class="rounded-xl border border-default bg-default shadow-xs">
    <h2 id="attention-title" class="flex h-11 items-center gap-2 px-4 text-sm font-medium text-highlighted sm:px-5">
      <UIcon name="i-lucide-triangle-alert" class="size-4 text-warning" aria-hidden="true" />
      Needs attention
    </h2>
    <ul class="divide-y divide-default border-t border-default">
      <li v-for="connection in items" :key="connection.id" class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-highlighted">{{ connection.institution ?? connection.name }}</span>
          <span class="block text-sm text-muted">{{ reason(connection) }}</span>
        </span>
        <UButton
          v-if="connection.canManage"
          color="neutral"
          variant="outline"
          :icon="connection.provider === 'enable_banking' ? 'i-lucide-link' : 'i-lucide-refresh-cw'"
          :label="connection.provider === 'enable_banking' ? 'Reconnect' : 'Try again'"
          :loading="pending === connection.id"
          @click="reconnect(connection)"
        />
        <span v-else class="text-xs text-muted">{{ connection.ownerName }} can reconnect it</span>
      </li>
    </ul>
  </section>
</template>
