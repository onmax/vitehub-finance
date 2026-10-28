<script setup lang="ts">
import { CsvImportModal } from "#components"
import type { AccountDetail, AccountSummary, TransactionPage } from "#shared/api"

// One account: its balance and how it moved, what it holds (crypto, investments), its latest transactions, and its
// settings. Import CSV adds transactions to it; Sync now asks its connection for fresh data.
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: account, status, error, refresh } = useScopedFetch<AccountDetail | null>(() => `/api/accounts/${id.value}`, {
  key: "account",
  unscoped: true,
  default: () => null,
})
useHead({ title: () => account.value?.name ?? translate('account') })

const shared = useShared()
const notify = useNotify()
const { format } = useMoney()
const kind = computed(() => (account.value ? ACCOUNT_KINDS[account.value.kind] : undefined))
const notFound = computed(() => errorStatus(error.value) === 404 || errorStatus(error.value) === 403)

const RANGES = [
  { value: 30, label: "30D" },
  { value: 90, label: "90D" },
  { value: 180, label: "6M" },
]
const range = ref(90)

// ViteHub Finance snapshots balances daily from the day an account arrives. A manual account with an imported CSV has its past in
// its transactions instead: walk back from today's balance through them (the latest 200), and say it's an estimate.
const estimated = ref<Array<{ date: string; balanceMinor: number }> | null>(null)
watch(
  () => account.value && account.value.history.length < 2 && account.value.id,
  async (accountId) => {
    estimated.value = null
    if (!accountId || !account.value || account.value.paymentBalance) return
    const balance = account.value.balanceMinor
    const page = await $fetch<TransactionPage>("/api/transactions", {
      query: { account: accountId, limit: 200, from: addDays(today(), -180) },
    }).catch(() => null)
    const items = (page?.items ?? []).filter((item) => !item.excluded && item.status === "booked")
    if (items.length < 2 || typeof page !== "object") return
    const byDay = new Map<string, number>()
    for (const item of items) byDay.set(item.date, (byDay.get(item.date) ?? 0) + item.amountMinor)
    const first = items.reduce((min, item) => (item.date < min ? item.date : min), today())
    const days: Array<{ date: string; balanceMinor: number }> = []
    let running = balance
    for (let day = today(); day >= first; day = addDays(day, -1)) {
      days.push({ date: day, balanceMinor: running })
      running -= byDay.get(day) ?? 0
    }
    estimated.value = days.reverse()
  },
  { immediate: true },
)
const history = computed(() => estimated.value ?? account.value?.history ?? [])
const points = computed(() => {
  const from = addDays(today(), -range.value)
  return history.value.filter((point) => point.date >= from).map((point) => ({ date: point.date, value: point.balanceMinor }))
})
const change = computed(() => {
  const first = points.value[0]
  const last = points.value.at(-1)
  if (!first || !last || points.value.length < 2) return null
  const delta = last.value - first.value
  return { delta, share: first.value === 0 ? null : delta / Math.abs(first.value) }
})
const formatAxis = (value: number) => format(Math.round(value), account.value?.currency, { compact: true })

const overlay = useOverlay()
const importModal = overlay.create(CsvImportModal, { destroyOnClose: true })
async function importCsv() {
  const result = await importModal.open({ accountId: id.value }).result
  if (result) await refresh()
}

const syncing = ref(false)
async function syncNow() {
  if (!account.value?.connectionId) return
  syncing.value = true
  try {
    await $fetch(`/api/connections/${account.value.connectionId}/sync`, { method: "POST" })
    await Promise.all([refresh(), refreshStems("transactions", "accounts", "overview")])
    notify.success(translate('synced2'))
  } catch (cause) {
    notify.error(cause, translate('syncFailed'))
  } finally {
    syncing.value = false
  }
}

function updated(next: AccountSummary) {
  if (account.value) account.value = { ...account.value, ...next }
}
</script>

<template>
  <UDashboardPanel id="account">
    <template #header>
      <PageNavbar :title="account?.name ?? $t('account')" :scoped="false">
        <template #leading>
          <UTooltip :text="$t('allAccounts')">
            <UButton to="/accounts" color="neutral" variant="ghost" icon="i-lucide-arrow-left" :aria-label="$t('allAccounts')" class="-ml-1.5" />
          </UTooltip>
        </template>
        <template #right>
          <template v-if="account">
            <UTooltip v-if="account.connectionId && account.canEdit" :text="$t('fetchTheLatestBalanceAndTransactions')">
              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-refresh-cw"
                :label="syncing ? $t('syncing') : $t('syncNow')"
                :loading="syncing"
                class="hidden sm:inline-flex"
                @click="syncNow"
              />
            </UTooltip>
            <UButton v-if="account.canEdit && !account.connectionId" color="neutral" variant="outline" icon="i-lucide-upload" :label="$t('importCsv')" @click="importCsv" />
          </template>
        </template>
      </PageNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <UEmpty
          v-if="notFound"
          variant="naked"
          icon="i-lucide-landmark"
          :title="$t('thisAccountIsnTHere')"
          :description="$t('itWasDeletedOrItsOwnerMadeItPrivate')"
          :actions="[{ label: $t('allAccounts'), to: '/accounts', icon: 'i-lucide-arrow-left' }]"
          class="py-16"
        />
        <PageError v-else-if="error" :error="error" :title="$t('thisAccountDidnTLoad')" @retry="refresh()" />

        <template v-else-if="!account && status === 'pending'">
          <div class="flex items-center gap-3">
            <USkeleton class="size-10 rounded-lg" />
            <div>
              <USkeleton class="h-5 w-48" />
              <USkeleton class="mt-2 h-3 w-32" />
            </div>
          </div>
          <USkeleton class="h-9 w-56" />
          <USkeleton class="h-72 w-full rounded-lg" />
        </template>

        <template v-else-if="account && kind">
          <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div class="flex min-w-0 items-start gap-3">
              <InstitutionMark :provider="account.provider" :name="account.institution" :logo="account.logo" :icon="kind.icon" size="lg" />
              <div class="min-w-0">
                <h1 class="truncate text-xl font-semibold text-highlighted" :title="account.name">{{ account.name }}</h1>
                <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                  <span>{{ account.institution ?? kind.label }}</span>
                  <template v-if="account.iban">
                    <span aria-hidden="true">·</span>
                    <span class="money font-mono text-xs" :title="account.iban">•••• {{ account.iban.replace(/\s/g, "").slice(-4) }}</span>
                  </template>
                  <span aria-hidden="true">·</span>
                  <SyncDot :status="account.connectionStatus" />
                </p>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <VisibilityBadge :visibility="account.visibility" />
                  <UBadge v-if="account.archived" color="neutral" variant="soft" size="sm" :label="$t('archived')" />
                  <UBadge v-if="!account.includeInNetWorth" color="neutral" variant="soft" size="sm" :label="$t('notInNetWorth')" />
                  <span v-if="shared" class="flex items-center gap-1.5 text-xs text-muted">
                    <OwnerAvatar :name="account.ownerName" :user-id="account.ownerId" size="3xs" />
                    {{ account.ownerName }}
                  </span>
                </div>
              </div>
            </div>
            <div class="sm:text-right">
              <p class="text-3xl font-semibold tracking-[-0.02em] text-highlighted">
                <Money :minor="account.balanceMinor" :currency="account.currency" original="below" align="start" class="sm:items-end sm:text-end" />
              </p>
              <p class="mt-1 text-sm text-muted">
                <template v-if="change">
                  <span class="money" :class="change.delta > 0 ? 'money-in' : 'text-default'">{{ format(change.delta, account.currency, { signed: true }) }}</span>
                  <span v-if="change.share !== null" class="money"> ({{ formatPercent(change.share, { signed: true, digits: 1 }) }})</span> {{ $t('in5', { value1: range === 180 ? $t('monthsCount', { count: 6 }, 6) : $t('dayCount', { count: range }, range) }) }} </template> {{ $t('updated', { value1: timeAgo(account.balanceUpdatedAt) }) }}
              </p>
            </div>
          </header>

          <section v-if="account.paymentBalance" class="rounded-lg border border-default p-4" :aria-label="$t('stripeSettlement')">
            <dl class="grid grid-cols-2 gap-4 text-sm">
              <div><dt class="text-muted">{{ $t('stripeAvailable') }}</dt><dd class="mt-1 font-medium text-highlighted"><Money :minor="account.paymentBalance.availableMinor" :currency="account.currency" /></dd></div>
              <div><dt class="text-muted">{{ $t('stripePending') }}</dt><dd class="mt-1 font-medium text-highlighted"><Money :minor="account.paymentBalance.pendingMinor" :currency="account.currency" /></dd></div>
            </dl>
            <p class="mt-3 text-xs text-muted">{{ $t('stripeForecastHelp') }}</p>
          </section>

          <div class="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div class="flex min-w-0 flex-col gap-10">
              <section class="border-t border-default" aria-labelledby="balance-history">
                <div class="flex h-12 items-center justify-between gap-3">
                  <h2 id="balance-history" class="text-sm font-medium text-highlighted">{{ $t('balance2') }}</h2>
                  <SegmentedControl v-model="range" :options="RANGES" :label="$t('period')" size="sm" />
                </div>
                <AreaChart
                  v-if="points.length > 1"
                  :points="points"
                  :format="formatAxis"
                  :label="$t('balance3', { value1: account.name })"
                  :height="220"
                />
                <p v-if="estimated && points.length > 1" class="mt-3 flex items-center gap-1.5 text-xs text-muted">
                  <UIcon name="i-lucide-info" class="size-3.5 shrink-0" /> {{ $t('estimatedFromThisAccountSTransactionsUntilThereAreEnough') }} </p>
                <p v-else-if="points.length <= 1" class="grid h-40 place-items-center text-center text-sm text-muted"> {{ $t('theBalanceIsSavedOnceADaySoTheChart') }} </p>
              </section>

              <AccountHoldings v-if="account.holdings.length" :holdings="account.holdings" :currency="account.currency" />
              <AccountStaking v-if="account.staking" :staking="account.staking" :currency="account.currency" />

              <AccountTransactions :account-id="account.id" :currency="account.currency" />
            </div>

            <AccountSettings :account="account" :holdings="account.holdings" @updated="updated" />
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
