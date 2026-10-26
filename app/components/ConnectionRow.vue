<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui"
import type { ConnectionSummary } from "#shared/api"

// One connection: what it is, whose, how it's doing, when its bank consent ends, and (for its owner) sync, reconnect,
// history, and remove.
const props = defineProps<{ connection: ConnectionSummary; highlighted?: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const shared = useShared()
const notify = useNotify()
const confirm = useConfirm()
const historyOpen = ref(false)
const pending = ref<"sync" | "reconnect" | "remove" | null>(null)
// The demo's connections are fakes: syncing, reconnecting, or removing them is refused (DemoLock, and the server).
const demo = useDemo()

const provider = computed(() => PROVIDERS[props.connection.provider])
const isBank = computed(() => props.connection.provider === "enable_banking")
const consent = computed(() => {
  const at = props.connection.consentExpiresAt
  if (!at) return null
  const days = daysFromToday(toDay(new Date(at)))
  const date = formatDay(toDay(new Date(at)), { relative: false })
  if (days < 0) return { text: `Consent ended ${date}`, warn: true }
  return { text: `Reconnect by ${date}`, warn: days <= 14 }
})
const needsReconnect = computed(() => isBank.value && (props.connection.status === "expired" || consent.value?.warn))

async function sync() {
  pending.value = "sync"
  try {
    await $fetch(`/api/connections/${props.connection.id}/sync`, { method: "POST" })
    emit("changed")
    await refreshStems("accounts", "overview", "transactions", "recurring", "forecast")
    notify.success(`${props.connection.name} is up to date`)
  } catch (error) {
    emit("changed")
    notify.error(error, `Couldn’t sync ${props.connection.name}`)
  } finally {
    pending.value = null
  }
}

async function reconnect() {
  pending.value = "reconnect"
  try {
    const { url } = await $fetch<{ url: string }>(`/api/connections/${props.connection.id}/reconnect`, { method: "POST" })
    window.location.href = url
  } catch (error) {
    notify.error(error, `Couldn’t reconnect ${props.connection.name}`)
    pending.value = null
  }
}

async function remove() {
  const count = props.connection.accountCount
  const { confirmed, checked } = await confirm({
    title: `Remove ${props.connection.name}?`,
    description: "It stops syncing, and its saved credentials are deleted.",
    confirmLabel: "Remove",
    destructive: true,
    checkbox: count
      ? {
          label: "Keep the accounts and their history",
          description: `${count} ${count === 1 ? "account stays" : "accounts stay"} as manual ${count === 1 ? "account" : "accounts"}. Unchecked, they and their transactions are deleted.`,
          default: true,
        }
      : undefined,
  })
  if (!confirmed) return
  pending.value = "remove"
  try {
    await $fetch(`/api/connections/${props.connection.id}`, { method: "DELETE", query: checked ? { keepAccounts: 1 } : {} })
    emit("changed")
    await refreshStems("accounts", "overview", "transactions", "recurring", "forecast")
    notify.success(`${props.connection.name} removed`)
  } catch (error) {
    notify.error(error, `Couldn’t remove ${props.connection.name}`)
  } finally {
    pending.value = null
  }
}

const menu = computed<DropdownMenuItem[][]>(() => [
  [
    ...(isBank.value
      ? [{ label: "Reconnect", icon: "i-lucide-link", onSelect: reconnect, disabled: demo, description: demo ? DEMO_LOCKED : undefined }]
      : []),
    { label: "Sync history", icon: "i-lucide-history", onSelect: () => (historyOpen.value = true) },
  ],
  [
    {
      label: "Remove…",
      icon: "i-lucide-trash-2",
      color: "error" as const,
      onSelect: remove,
      disabled: demo,
      description: demo ? DEMO_LOCKED : undefined,
    },
  ],
])
</script>

<template>
  <li
    :id="`connection-${connection.id}`"
    class="flex scroll-mt-4 flex-wrap items-center gap-x-3 gap-y-2 py-3 transition-colors duration-700 sm:flex-nowrap"
    :class="highlighted && 'bg-primary/8'"
  >
    <InstitutionMark :provider="connection.provider" :name="connection.institution ?? connection.name" :logo="connection.logo" />
    <div class="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-auto">
      <p class="flex items-center gap-2">
        <span class="truncate text-sm font-medium text-highlighted" :title="connection.name">{{ connection.name }}</span>
        <OwnerAvatar v-if="shared" :name="connection.ownerName" :user-id="connection.ownerId" size="3xs" />
      </p>
      <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
        <SyncDot :status="connection.status" />
        <span aria-hidden="true">·</span>
        <span>{{ provider.label }}</span>
        <span aria-hidden="true">·</span>
        <span class="tabular-nums">{{ connection.accountCount }} {{ connection.accountCount === 1 ? "account" : "accounts" }}</span>
        <span aria-hidden="true">·</span>
        <span :title="connection.lastSyncedAt ? formatDateTime(connection.lastSyncedAt) : undefined">{{ connection.lastSyncedAt ? `Synced ${timeAgo(connection.lastSyncedAt)}` : "Not synced yet" }}</span>
        <template v-if="consent">
          <span aria-hidden="true">·</span>
          <span class="inline-flex items-center gap-1" :class="consent.warn ? 'font-medium text-warning' : ''">
            <UIcon v-if="consent.warn" name="i-lucide-triangle-alert" class="size-3.5" />{{ consent.text }}
          </span>
        </template>
      </p>
      <p v-if="connection.lastError && connection.status !== 'active'" class="mt-1 text-xs text-error text-pretty">{{ connection.lastError }}</p>
    </div>
    <div v-if="connection.canManage" class="ml-12 flex shrink-0 items-center gap-1 sm:ml-auto">
      <DemoLock v-slot="{ locked }">
        <UButton
          v-if="needsReconnect"
          color="neutral"
          variant="outline"
          icon="i-lucide-link"
          label="Reconnect"
          :loading="pending === 'reconnect'"
          :disabled="locked"
          @click="reconnect"
        />
        <UButton
          v-else
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          label="Sync now"
          :loading="pending === 'sync'"
          :disabled="locked || pending !== null || connection.status === 'pending'"
          @click="sync"
        />
      </DemoLock>
      <UDropdownMenu :items="menu" :content="{ align: 'end' }">
        <UTooltip text="More">
          <UButton color="neutral" variant="ghost" icon="i-lucide-ellipsis" :aria-label="`More for ${connection.name}`" class="size-10 justify-center" :loading="pending === 'remove'" />
        </UTooltip>
      </UDropdownMenu>
    </div>
    <ConnectionRuns v-if="connection.canManage" v-model:open="historyOpen" :connection="connection" />
  </li>
</template>
