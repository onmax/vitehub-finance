<script setup lang="ts">
import { AccountCreateModal, CsvImportModal } from "#components"
import type { AccountSummary } from "#shared/api"

// Every account the caller sees, grouped by kind with each group's total, and a line of totals on top: what you have,
// what you owe, and the net. Manual accounts are added here (also from ⌘K through `?new=1`).
useHead({ title: "Accounts" })

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
      <PageNavbar title="Accounts">
        <template #right>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-upload"
            label="Import CSV"
            class="hidden sm:inline-flex"
            @click="importModal.open()"
          />
          <UButton icon="i-lucide-plus" label="Add account" class="hidden sm:inline-flex" @click="addAccount" />
          <UTooltip text="Add account">
            <UButton icon="i-lucide-plus" aria-label="Add account" class="sm:hidden" @click="addAccount" />
          </UTooltip>
        </template>
      </PageNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <PageError v-if="error" :error="error" title="Your accounts didn’t load" @retry="refresh()" />

        <template v-else-if="loading">
          <div class="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-default bg-(--ui-border)">
            <div v-for="index in 3" :key="index" class="bg-default p-4">
              <USkeleton class="h-3 w-16" />
              <USkeleton class="mt-2 h-6 w-28" />
            </div>
          </div>
          <div v-for="index in 2" :key="index" class="overflow-hidden rounded-xl border border-default">
            <div class="flex justify-between border-b border-default bg-muted/50 px-5 py-3">
              <USkeleton class="h-4 w-24" />
              <USkeleton class="h-4 w-20" />
            </div>
            <div v-for="row in 3" :key="row" class="flex items-center gap-3 px-5 py-3">
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
          variant="outline"
          icon="i-lucide-landmark"
          title="No accounts yet"
          description="Connect your bank and Joxi keeps balances and transactions up to date. For cash or a bank Joxi can’t reach, add an account by hand."
          :actions="[
            { label: 'Connect a bank', icon: 'i-lucide-plug', to: '/connect' },
            { label: 'Add a manual account', color: 'neutral', variant: 'ghost', onClick: addAccount },
          ]"
          class="py-16"
        />

        <template v-else>
          <dl class="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-default bg-(--ui-border) shadow-xs">
            <div class="bg-default px-4 py-3 sm:px-5">
              <dt class="text-xs text-muted sm:text-sm">Net worth</dt>
              <dd class="mt-1 text-base font-semibold text-highlighted sm:text-xl"><Money :minor="assets + debts" compact /></dd>
            </div>
            <div class="bg-default px-4 py-3 sm:px-5">
              <dt class="text-xs text-muted sm:text-sm">Assets</dt>
              <dd class="mt-1 text-base font-semibold text-highlighted sm:text-xl"><Money :minor="assets" compact /></dd>
            </div>
            <div class="bg-default px-4 py-3 sm:px-5">
              <dt class="text-xs text-muted sm:text-sm">Debts</dt>
              <dd class="mt-1 text-base font-semibold text-highlighted sm:text-xl"><Money :minor="Math.abs(debts)" compact /></dd>
            </div>
          </dl>

          <div class="flex items-center justify-between gap-3">
            <p class="text-sm text-muted">
              {{ formatCount(accounts.length) }} account{{ accounts.length === 1 ? "" : "s" }}
            </p>
            <USwitch v-model="showArchived" label="Show archived" size="sm" />
          </div>

          <AccountGroup v-for="group in groups" :key="group.id" :label="group.label" :accounts="group.accounts" />
          <p v-if="groups.length === 0" class="py-8 text-center text-sm text-muted">No archived accounts.</p>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
