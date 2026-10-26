<script setup lang="ts">
import { AccountCreateModal, CsvImportModal } from "#components"

// Banks: the household's bank connections with their state, consent dates, and actions, then the ways to add one: a
// bank over PSD2, a manual account, a CSV import. The bank's redirect lands here with `?linked=<id>` or `?error=<message>`.
useHead({ title: "Banks" })
const route = useRoute()
const router = useRouter()
const notify = useNotify()
const overlay = useOverlay()
const manualModal = overlay.create(AccountCreateModal, { destroyOnClose: true })
const importModal = overlay.create(CsvImportModal, { destroyOnClose: true })

const { connections, status, error, refresh, highlight, flash } = useConnectPage("/connect/banks")
const bankError = ref<string | null>(typeof route.query.error === "string" ? route.query.error : null)

onMounted(() => {
  if (typeof route.query.linked === "string") {
    notify.success("Connected", "ViteHub Finance synced its accounts and keeps them up to date every day.")
    flash(route.query.linked)
    void refresh()
  }
  if (route.query.linked || route.query.error) router.replace({ query: {}, hash: bankError.value ? "#bank" : route.hash })
})

async function addManual() {
  const account = await manualModal.open().result
  if (account) {
    notify.success(`${account.name} added`)
    await navigateTo(`/accounts/${account.id}`)
  }
}

async function importCsv() {
  const result = await importModal.open().result
  if (result) {
    notify.success(`${formatCount(result.added)} transactions imported`, result.skipped ? `${formatCount(result.skipped)} were already there.` : undefined)
    await refreshStems("accounts", "overview", "transactions", "recurring", "forecast", "budgets")
  }
}
</script>

<template>
  <UDashboardPanel id="connect-banks">
    <template #header>
      <PageNavbar title="Banks" :scoped="false" />
    </template>
    <template #body>
      <div class="mx-auto flex w-full max-w-4xl flex-col gap-10">
        <section v-if="error || connections.length || status === 'pending'" aria-labelledby="connections-title" class="flex flex-col gap-1">
          <div class="flex items-baseline justify-between gap-3">
            <h2 id="connections-title" class="text-sm font-medium text-highlighted">Your banks</h2>
            <p v-if="connections.length" class="text-xs text-muted">Synced daily</p>
          </div>
          <PageError v-if="error" :error="error" title="Couldn’t load your connections" @retry="refresh()" />
          <ConnectionList v-else :connections="connections" :loading="status === 'pending'" :highlight="highlight" @changed="refresh()" />
        </section>

        <ConnectSection
          id="bank"
          icon="i-lucide-landmark"
          :title="connections.length ? 'Connect another bank' : 'Connect a bank'"
          description="Checking, savings, and cards from European banks, read-only over PSD2."
        >
          <ConnectBankPicker :error="bankError" @dismiss-error="bankError = null" />
        </ConnectSection>

        <div class="grid gap-10 sm:grid-cols-2 sm:gap-8">
          <ConnectSection id="manual" icon="i-lucide-pencil-line" title="Manual account" description="Cash, a pension, a loan, or a property. You update the balance.">
            <template #actions>
              <UButton color="neutral" variant="outline" icon="i-lucide-plus" label="Add" class="shrink-0" @click="addManual" />
            </template>
          </ConnectSection>
          <ConnectSection id="import" icon="i-lucide-upload" title="Import a CSV" description="Transactions exported from any bank, mapped column by column.">
            <template #actions>
              <UButton color="neutral" variant="outline" icon="i-lucide-file-up" label="Import" class="shrink-0" @click="importCsv" />
            </template>
          </ConnectSection>
        </div>

        <p class="text-sm text-muted">
          Exchanges, wallets, and Interactive Brokers are under
          <ULink to="/connect/crypto" class="font-medium text-highlighted underline underline-offset-4">Crypto &amp; investments</ULink>.
        </p>
      </div>
    </template>
  </UDashboardPanel>
</template>
