<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui"
import type { ConnectionSummary } from "#shared/api"

// One connection: what it is, whose, how it's doing, when its bank consent ends, the accounts it feeds (each opens on its
// own page), and (for its owner) sync, reconnect, history, and remove.
const props = defineProps<{ connection: ConnectionSummary; highlighted?: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const shared = useShared()
const notify = useNotify()
const confirm = useConfirm()
const historyOpen = ref(false)
const pending = ref<"sync" | "reconnect" | "remove" | null>(null)
// The demo's connections are fakes: syncing, reconnecting, or removing them is refused (DemoLock, and the server).
const demo = useDemoPerson()

const provider = computed(() => PROVIDERS[props.connection.provider])
const isBank = computed(() => props.connection.provider === "enable_banking")
const consent = computed(() => {
  const at = props.connection.consentExpiresAt
  if (!at) return null
  const days = daysFromToday(toDay(new Date(at)))
  const date = formatDay(toDay(new Date(at)), { relative: false })
  if (days < 0) return { text: translate('consentEnded', { value1: date }), warn: true }
  return { text: translate('reconnectBy', { value1: date }), warn: days <= 14 }
})
const needsReconnect = computed(() => isBank.value && (props.connection.status === "expired" || consent.value?.warn))

async function sync() {
  pending.value = "sync"
  try {
    await $fetch(`/api/connections/${props.connection.id}/sync`, { method: "POST" })
    emit("changed")
    await refreshStems("accounts", "overview", "transactions", "recurring", "forecast", "sync-status")
    notify.success(translate('isUpToDate', { value1: props.connection.name }))
  } catch (error) {
    emit("changed")
    void refreshNuxtData("sync-status")
    notify.error(error, translate('couldnTSync', { value1: props.connection.name }))
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
    notify.error(error, translate('couldnTReconnect', { value1: props.connection.name }))
    pending.value = null
  }
}

async function remove() {
  const count = props.connection.accounts.length
  const { confirmed, checked } = await confirm({
    title: translate('remove', { value1: props.connection.name }),
    get description() { return translate('itStopsSyncingAndItsSavedCredentialsAreDeleted') },
    confirmLabel: translate('remove2'),
    destructive: true,
    checkbox: count
      ? {
          get label() { return translate('keepTheAccountsAndTheirHistory') },
          description: translate('asManualUncheckedTheyAndTheirTransactionsAreDeleted', { count: formatCount(count) }, count),
          default: true,
        }
      : undefined,
  })
  if (!confirmed) return
  pending.value = "remove"
  try {
    await $fetch(`/api/connections/${props.connection.id}`, { method: "DELETE", query: checked ? { keepAccounts: 1 } : {} })
    emit("changed")
    await refreshStems("accounts", "overview", "transactions", "recurring", "forecast", "sync-status")
    notify.success(translate('removed', { value1: props.connection.name }))
  } catch (error) {
    notify.error(error, translate('couldnTRemove', { value1: props.connection.name }))
  } finally {
    pending.value = null
  }
}

const accounts = computed(() => props.connection.accounts)
const accountItems = computed<DropdownMenuItem[]>(() => accounts.value.map((account) => ({ label: account.name, to: `/accounts/${account.id}` })))

const menu = computed<DropdownMenuItem[][]>(() => [
  [
    ...(isBank.value
      ? [{ get label() { return translate('reconnect') }, icon: "i-lucide-link", onSelect: reconnect, disabled: demo.value, description: demo.value ? demoLocked() : undefined }]
      : []),
    { get label() { return translate('syncHistory') }, icon: "i-lucide-history", onSelect: () => (historyOpen.value = true) },
  ],
  [
    {
      get label() { return translate('remove3') },
      icon: "i-lucide-trash-2",
      color: "error" as const,
      onSelect: remove,
      disabled: demo.value,
      description: demo.value ? demoLocked() : undefined,
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
        <ULink
          v-if="accounts.length === 1"
          :to="`/accounts/${accounts[0]!.id}`"
          class="truncate text-sm font-medium text-highlighted underline-offset-4 hover:underline"
          :title="connection.name"
        >{{ connection.name }}</ULink>
        <span v-else class="truncate text-sm font-medium text-highlighted" :title="connection.name">{{ connection.name }}</span>
        <OwnerAvatar v-if="shared" :name="connection.ownerName" :user-id="connection.ownerId" size="3xs" />
      </p>
      <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
        <SyncDot :status="connection.status" />
        <span aria-hidden="true">·</span>
        <span>{{ provider.label }}</span>
        <span aria-hidden="true">·</span>
        <ULink v-if="accounts.length === 1" :to="`/accounts/${accounts[0]!.id}`" class="tabular-nums underline-offset-4 hover:text-highlighted hover:underline">
          {{ $t('account2', { count: formatCount(1) }, 1) }}
        </ULink>
        <UDropdownMenu v-else-if="accounts.length" :items="accountItems" :content="{ align: 'start' }">
          <button type="button" class="inline-flex items-center gap-0.5 tabular-nums underline-offset-4 hover:text-highlighted hover:underline">
            {{ $t('account2', { count: formatCount(accounts.length) }, accounts.length) }}<UIcon name="i-lucide-chevron-down" class="size-3" />
          </button>
        </UDropdownMenu>
        <span v-else class="tabular-nums">{{ $t('account2', { count: formatCount(0) }, 0) }}</span>
        <span aria-hidden="true">·</span>
        <span :title="connection.lastSyncedAt ? formatDateTime(connection.lastSyncedAt) : undefined">{{ connection.lastSyncedAt ? $t('synced', { value1: timeAgo(connection.lastSyncedAt) }) : $t('notSyncedYet') }}</span>
        <template v-if="consent">
          <span aria-hidden="true">·</span>
          <span class="inline-flex items-center gap-1" :class="consent.warn ? 'font-medium text-warning' : ''">
            <UIcon v-if="consent.warn" name="i-lucide-triangle-alert" class="size-3.5" />{{ consent.text }}
          </span>
        </template>
      </p>
      <p v-if="connection.lastError && connection.status !== 'active'" class="mt-1 text-xs text-error text-pretty">{{ providerErrorText(connection.lastError, connection.lastErrorCode) }}</p>
    </div>
    <div v-if="connection.canManage" class="ml-12 flex shrink-0 items-center gap-1 sm:ml-auto">
      <DemoLock v-slot="{ locked }">
        <UButton
          v-if="needsReconnect"
          color="neutral"
          variant="outline"
          icon="i-lucide-link"
          :label="$t('reconnect')"
          :loading="pending === 'reconnect'"
          :disabled="locked"
          @click="reconnect"
        />
        <UButton
          v-else
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          :label="$t('syncNow')"
          :loading="pending === 'sync'"
          :disabled="locked || pending !== null || connection.status === 'pending'"
          @click="sync"
        />
      </DemoLock>
      <UDropdownMenu :items="menu" :content="{ align: 'end' }">
        <UTooltip :text="$t('more')">
          <UButton color="neutral" variant="ghost" icon="i-lucide-ellipsis" :aria-label="$t('moreFor', { value1: connection.name })" class="size-10 justify-center" :loading="pending === 'remove'" />
        </UTooltip>
      </UDropdownMenu>
    </div>
    <ConnectionRuns v-if="connection.canManage" v-model:open="historyOpen" :connection="connection" />
  </li>
</template>
