<script setup lang="ts">
import type { CatalogProvider } from "~/utils/connect-catalog"
import type { AccountSummary, ConnectionSummary } from "#shared/api"

// One provider's connect dialog: its steps one at a time, each asking for one thing with its help inline (Executor's
// authenticate dialog), then the new connection and the accounts it found. The page keys it per provider, so closing
// throws a half-finished attempt away. `connected` fires as soon as the server linked it; `done` when people leave the
// success screen, so the page can land on the new connection. It hangs from a fixed top, so a taller step grows down
// instead of moving the title.
const props = defineProps<{ entry: CatalogProvider }>()
const open = defineModel<boolean>("open", { default: false })
const emit = defineEmits<{ connected: [connection: ConnectionSummary]; done: [connection: ConnectionSummary] }>()

const index = ref(0)
const current = computed(() => props.entry.steps[index.value])
const last = computed(() => index.value === props.entry.steps.length - 1)
const pending = ref(false)
const error = ref("")
const result = ref<ConnectionSummary | null>(null)
const accounts = ref<AccountSummary[] | null>(null)
const formId = `connect-step-${useId()}`

provideConnectFlow({
  entry: props.entry,
  formId,
  pending,
  error,
  next() {
    error.value = ""
    if (!last.value) index.value++
  },
  async connect(request, fallback) {
    pending.value = true
    error.value = ""
    try {
      const connection = await request()
      // Its accounts, as the server sees them right after the first sync (inline here, or a moment later from a Queue).
      accounts.value = await $fetch<AccountSummary[]>("/api/accounts", { query: { scope: "household" } })
        .then((list) => list.filter((account) => account.connectionId === connection.id))
        .catch(() => [])
      result.value = connection
      emit("connected", connection)
      void refreshNuxtData("sync-status")
    } catch (cause) {
      error.value = errorText(cause, fallback)
    } finally {
      pending.value = false
    }
  },
})

function back() {
  error.value = ""
  index.value = Math.max(0, index.value - 1)
}

// Leaving the success screen, by Done or by closing it, lands on the new connection (`after:leave`).
function finish() {
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :dismissible="!pending"
    :description="result ? $t('catalogConnectedDescription') : current?.title"
    :ui="{ content: 'sm:max-w-lg top-[6dvh] translate-y-0 max-h-[88dvh] sm:top-[12dvh] sm:max-h-[76dvh]', header: 'items-start', body: 'flex flex-col gap-5', footer: 'justify-between gap-2' }"
    @after:leave="result && emit('done', result)"
  >
    <template #title>
      <span class="flex items-center gap-3">
        <InstitutionMark :provider="entry.provider" :name="entry.name" size="sm" />
        <span>{{ result ? $t('catalogIsConnected', { name: entry.name }) : $t('connect', { value1: entry.name }) }}</span>
      </span>
    </template>

    <template #body>
      <template v-if="result">
        <div v-if="result.status === 'error'" class="flex gap-2 rounded-lg bg-warning/10 p-3 text-sm text-warning">
          <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" />
          <p class="text-pretty">{{ result.lastError ? providerErrorText(result.lastError, result.lastErrorCode) : $t('catalogFirstSyncFailed') }}</p>
        </div>
        <section v-if="accounts?.length" :aria-label="$t('accounts')">
          <h3 class="font-mono text-[11px] font-medium tracking-wider text-muted uppercase">{{ $t('catalogAccountsFound', { count: accounts.length }, accounts.length) }}</h3>
          <ul class="mt-2 divide-y divide-default rounded-lg border border-default">
            <li v-for="account in accounts" :key="account.id" class="flex items-center gap-3 px-3 py-2.5">
              <UIcon :name="ACCOUNT_KINDS[account.kind].icon" class="size-4 shrink-0 text-muted" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-highlighted">{{ account.name }}</span>
                <span class="block text-xs text-muted">{{ ACCOUNT_KINDS[account.kind].label }} · {{ account.currency }}</span>
              </span>
              <Money :minor="account.balanceMinor" :currency="account.currency" original="below" class="shrink-0 text-sm text-highlighted" />
            </li>
          </ul>
        </section>
        <p v-else-if="result.status !== 'error'" class="text-sm text-muted">{{ $t('catalogAccountsAppearAfterTheFirstSync') }}</p>
        <p class="flex gap-2 text-xs text-muted">
          <UIcon name="i-lucide-refresh-cw" class="mt-px size-3.5 shrink-0" />{{ $t('catalogSyncsEveryDay') }}
        </p>
      </template>

      <template v-else-if="current">
        <div v-if="entry.steps.length > 1" class="flex flex-col gap-2">
          <ol class="flex gap-1" :aria-label="$t('catalogSteps')">
            <li
              v-for="(item, position) in entry.steps"
              :key="item.id"
              class="h-1 flex-1 rounded-full transition-colors duration-200"
              :class="position <= index ? 'bg-inverted' : 'bg-elevated'"
              :aria-current="position === index ? 'step' : undefined"
            >
              <span class="sr-only">{{ item.title }}</span>
            </li>
          </ol>
          <p class="font-mono text-[11px] font-medium tracking-wider text-muted uppercase">{{ $t('catalogStepOf', { step: index + 1, total: entry.steps.length }) }}</p>
        </div>
        <component :is="current.component" :key="current.id" />
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />
      </template>
    </template>

    <template #footer>
      <template v-if="result">
        <UButton color="neutral" variant="ghost" :label="$t('catalogSeeAccounts')" to="/accounts" @click="open = false" />
        <UButton :label="$t('done')" autofocus @click="finish" />
      </template>
      <template v-else-if="current">
        <UButton v-if="index > 0" color="neutral" variant="ghost" icon="i-lucide-arrow-left" :label="$t('back')" :disabled="pending" @click="back" />
        <UButton v-else color="neutral" variant="ghost" :label="$t('cancel')" @click="open = false" />
        <DemoLock v-if="last" v-slot="{ locked }">
          <UButton type="submit" :form="formId" :label="current.action ?? $t('continue')" :loading="pending" :disabled="locked" />
        </DemoLock>
        <UButton v-else type="submit" :form="formId" trailing-icon="i-lucide-arrow-right" :label="current.action ?? $t('continue')" />
      </template>
    </template>
  </UModal>
</template>
