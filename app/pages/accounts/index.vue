<script setup lang="ts">
import { AccountCreateModal, CsvImportModal } from "#components"
import type { AccountSummary } from "#shared/api"

// Every account the caller sees, grouped by kind with each group's total, and a line of totals on top: what you have,
// what you owe, and the net. Manual accounts are added here (also from ⌘K through `?new=1`).
useHead({ get title() { return translate('accounts') } })

const route = useRoute()
const router = useRouter()
const showArchived = ref(false)
const { data: accounts, status, error, refresh } = useAccounts({ archived: showArchived })
const overlay = useOverlay()
const createModal = overlay.create(AccountCreateModal, { destroyOnClose: true })
const importModal = overlay.create(CsvImportModal, { destroyOnClose: true })

async function addAccount() {
  const account = (await createModal.open().result) as AccountSummary | undefined
  if (account) await navigateTo(`/accounts/${account.id}`)
}

onMounted(() => {
  if (route.query.new === "1") {
    void router.replace({ query: { ...route.query, new: undefined } })
    void addAccount()
  }
})

const groups = computed(() =>
  ACCOUNT_GROUPS.map((group) => ({
    ...group,
    accounts: accounts.value.filter((account) => ACCOUNT_KINDS[account.kind].group === group.id),
  })).filter((group) => group.accounts.length),
)
const counted = computed(() => accounts.value.filter((account) => !account.archived && account.includeInNetWorth))
const assets = computed(() => counted.value.reduce((sum, account) => sum + Math.max(0, account.balanceBaseMinor), 0))
const debts = computed(() => counted.value.reduce((sum, account) => sum + Math.min(0, account.balanceBaseMinor), 0))
const loading = computed(() => status.value === "pending" && accounts.value.length === 0)
</script>

<template>
  <UDashboardPanel id="accounts">
    <template #header>
      <PageNavbar :title="$t('accounts')">
        <template #right>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-upload"
            :label="$t('importCsv')"
            class="hidden sm:inline-flex"
            @click="importModal.open()"
          />
          <UButton icon="i-lucide-plus" :label="$t('addAccount')" class="hidden sm:inline-flex" @click="addAccount" />
          <UTooltip :text="$t('addAccount')">
            <UButton icon="i-lucide-plus" :aria-label="$t('addAccount')" class="sm:hidden" @click="addAccount" />
          </UTooltip>
        </template>
      </PageNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <PageError v-if="error" :error="error" :title="$t('yourAccountsDidnTLoad')" @retry="refresh()" />

        <template v-else-if="loading">
          <div class="grid grid-cols-3 divide-x divide-default">
            <div v-for="index in 3" :key="index" class="px-4 first:ps-0 sm:px-6">
              <USkeleton class="h-3 w-16" />
              <USkeleton class="mt-2 h-6 w-28" />
            </div>
          </div>
          <div v-for="index in 2" :key="index">
            <div class="flex justify-between border-b border-default pb-2">
              <USkeleton class="h-4 w-24" />
              <USkeleton class="h-4 w-20" />
            </div>
            <div v-for="row in 3" :key="row" class="flex items-center gap-3 py-3">
              <USkeleton class="size-9 rounded-lg" />
              <div class="flex-1">
                <USkeleton class="h-4 w-40" />
                <USkeleton class="mt-1.5 h-3 w-24" />
              </div>
              <USkeleton class="h-4 w-20" />
            </div>
          </div>
        </template>

        <UEmpty
          v-else-if="accounts.length === 0 && !showArchived"
          variant="naked"
          icon="i-lucide-landmark"
          :title="$t('noAccountsYet')"
          :description="$t('connectYourBankToKeepBalancesAndTransactionsUpTo')"
          :actions="[
            { label: $t('connectABank'), icon: 'i-lucide-plug', to: '/connect/banks' },
            { label: $t('addAManualAccount'), color: 'neutral', variant: 'ghost', onClick: addAccount },
          ]"
          class="py-16"
        />

        <template v-else>
          <dl class="grid grid-cols-3 divide-x divide-default">
            <div class="px-4 first:ps-0 sm:px-6">
              <dt class="text-xs text-muted sm:text-sm">{{ $t('netWorth') }}</dt>
              <dd class="mt-1 text-lg font-semibold text-highlighted sm:text-2xl"><Money :minor="assets + debts" compact original="below" align="start" /></dd>
            </div>
            <div class="px-4 first:ps-0 sm:px-6">
              <dt class="text-xs text-muted sm:text-sm">{{ $t('assets') }}</dt>
              <dd class="mt-1 text-lg font-semibold text-highlighted sm:text-2xl"><Money :minor="assets" compact original="below" align="start" /></dd>
            </div>
            <div class="px-4 first:ps-0 sm:px-6">
              <dt class="text-xs text-muted sm:text-sm">{{ $t('debts') }}</dt>
              <dd class="mt-1 text-lg font-semibold text-highlighted sm:text-2xl"><Money :minor="Math.abs(debts)" compact original="below" align="start" /></dd>
            </div>
          </dl>

          <div class="flex items-center justify-between gap-3">
            <p class="text-sm text-muted">
              {{ $t('account2', { count: formatCount(accounts.length) }, accounts.length) }}
            </p>
            <USwitch v-model="showArchived" :label="$t('showArchived')" size="sm" />
          </div>

          <AccountGroup v-for="group in groups" :key="group.id" :label="group.label" :accounts="group.accounts" />
          <p v-if="groups.length === 0" class="py-8 text-center text-sm text-muted">{{ $t('noArchivedAccounts') }}</p>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
