<script setup lang="ts">
import type { ConnectionSummary } from "#shared/api"
import { AccountCreateModal, CsvImportModal } from "#components"

// Bring money in: banks over PSD2, exchanges with read-only keys, public wallets, manual accounts, and CSV imports.
// Existing connections sit on top with their state, consent dates, and actions. The bank's redirect lands here with
// `?linked=<id>` or `?error=<message>`.
useHead({ title: "Connect" })
const route = useRoute()
const router = useRouter()
const notify = useNotify()
const overlay = useOverlay()
const manualModal = overlay.create(AccountCreateModal, { destroyOnClose: true })
const importModal = overlay.create(CsvImportModal, { destroyOnClose: true })

const { data: connections, status, error, refresh } = useScopedFetch<ConnectionSummary[]>("/api/connections", {
  key: "connections",
  unscoped: true,
  default: () => [],
})

const bankError = ref<string | null>(typeof route.query.error === "string" ? route.query.error : null)
const highlight = ref<string | null>(typeof route.query.linked === "string" ? route.query.linked : null)

const motion = usePreferredReducedMotion()
function scrollTo(selector: string) {
  nextTick(() => document.querySelector(selector)?.scrollIntoView({ block: "start", behavior: motion.value === "reduce" ? "auto" : "smooth" }))
}

onMounted(() => {
  if (highlight.value) {
    notify.success("Connected", "ViteHub Finance synced its accounts and keeps them up to date every day.")
    void refresh()
    setTimeout(() => (highlight.value = null), 4000)
  }
  if (route.query.linked || route.query.error) router.replace({ query: {}, hash: bankError.value ? "#bank" : route.hash })
  const target = bankError.value ? "#bank" : route.hash
  // Wait for the connections above to load, so the section doesn't move after the scroll.
  if (target) until(status).not.toBe("pending").then(() => scrollTo(target))
})
watch(
  () => route.hash,
  (hash) => hash && scrollTo(hash),
)

async function connected(connection: ConnectionSummary) {
  highlight.value = connection.id
  await refresh()
  await refreshStems("accounts", "overview", "transactions")
  notify.success(`${connection.name} connected`, connection.status === "error" ? (connection.lastError ?? undefined) : "Its balance is in your accounts now.")
  scrollTo(`#connection-${connection.id}`)
  setTimeout(() => (highlight.value = null), 4000)
}

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
  <UDashboardPanel id="connect">
    <template #header>
      <PageNavbar title="Connect" :scoped="false" />
    </template>
    <template #body>
      <div class="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <section v-if="error || connections.length || status === 'pending'" aria-labelledby="connections-title" class="flex flex-col gap-3">
          <div class="flex items-baseline justify-between gap-3">
            <h2 id="connections-title" class="text-sm font-medium text-muted">Your connections</h2>
            <p v-if="connections.length" class="text-xs text-muted">Synced daily</p>
          </div>
          <PageError v-if="error" :error="error" title="Couldn’t load your connections" @retry="refresh()" />
          <ConnectionList v-else :connections="connections" :loading="status === 'pending'" :highlight="highlight" @changed="refresh()" />
        </section>

        <section aria-labelledby="add-title" class="flex flex-col gap-3">
          <div>
            <h2 id="add-title" class="text-sm font-medium text-muted">{{ connections.length ? "Add another" : "Add your first account" }}</h2>
          </div>

          <ConnectSection
            id="bank"
            icon="i-lucide-landmark"
            title="Bank account"
            description="Checking, savings, and cards from European banks, read-only over PSD2."
          >
            <ConnectBankPicker :error="bankError" @dismiss-error="bankError = null" />
          </ConnectSection>

          <div class="grid items-start gap-3 lg:grid-cols-2">
            <ConnectSection
              id="exchange"
              icon="i-lucide-bitcoin"
              title="Crypto exchange"
              description="Balances from Kraken, Binance, or Coinbase with a read-only API key."
            >
              <ConnectExchangeForm @connected="connected" />
            </ConnectSection>
            <ConnectSection
              id="wallet"
              icon="i-lucide-wallet"
              title="Wallet"
              description="Watch a public address on Bitcoin, Ethereum, Solana, the XRP Ledger, or Nimiq. Staked NIM counts too."
            >
              <ConnectWalletForm @connected="connected" />
            </ConnectSection>
          </div>

          <div class="grid items-start gap-3 lg:grid-cols-2">
            <ConnectSection
              id="manual"
              icon="i-lucide-pencil-line"
              title="Manual account"
              description="Cash, a pension, a loan, or a property. You update the balance."
            >
              <template #actions>
                <UButton color="neutral" variant="outline" icon="i-lucide-plus" label="Add" class="shrink-0" @click="addManual" />
              </template>
            </ConnectSection>
            <ConnectSection
              id="import"
              icon="i-lucide-upload"
              title="Import a CSV"
              description="Transactions exported from any bank, mapped column by column."
            >
              <template #actions>
                <UButton color="neutral" variant="outline" icon="i-lucide-file-up" label="Import" class="shrink-0" @click="importCsv" />
              </template>
            </ConnectSection>
          </div>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
