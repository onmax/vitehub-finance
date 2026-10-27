<script setup lang="ts">
// Banks: the household's bank connections with their state, consent dates, and actions, then the ways to add one: a
// bank over PSD2, a manual account, a CSV import. The bank's redirect lands here with `?linked=<id>` or `?error=<message>`.
useHead({ get title() { return translate('banks') } })
const route = useRoute()
const router = useRouter()
const notify = useNotify()
const { addManual, importCsv } = useAccountAdders()

const { connections, status, error, refresh, highlight, flash } = useConnectPage("/connect/banks")
const bankFailure = ref(typeof route.query.error === "string" ? route.query.error : null)
const bankErrorCode = typeof route.query.error_code === "string" ? route.query.error_code : null
const bankError = computed(() => bankFailure.value ? providerErrorText(bankFailure.value, bankErrorCode) : null)

onMounted(() => {
  if (typeof route.query.linked === "string") {
    notify.success(translate('bankConnected'), translate('itsAccountsAreHereNowAndSyncEveryDay'))
    flash(route.query.linked)
    void refresh()
  }
  if (route.query.linked || route.query.error) router.replace({ query: {}, hash: bankError.value ? "#bank" : route.hash })
})
</script>

<template>
  <UDashboardPanel id="connect-banks">
    <template #header>
      <PageNavbar :title="$t('banks')" :scoped="false" />
    </template>
    <template #body>
      <div class="mx-auto flex w-full max-w-4xl flex-col gap-10">
        <section v-if="error || connections.length || status === 'pending'" aria-labelledby="connections-title" class="flex flex-col gap-1">
          <div class="flex items-baseline justify-between gap-3">
            <h2 id="connections-title" class="text-sm font-medium text-highlighted">{{ $t('yourBanks') }}</h2>
            <p v-if="connections.length" class="text-xs text-muted">{{ $t('syncedDaily') }}</p>
          </div>
          <PageError v-if="error" :error="error" :title="$t('couldnTLoadYourConnections')" @retry="refresh()" />
          <ConnectionList v-else :connections="connections" :loading="status === 'pending'" :highlight="highlight" @changed="refresh()" />
        </section>

        <ConnectSection
          id="bank"
          icon="i-lucide-landmark"
          :title="connections.length ? $t('connectAnotherBank') : $t('connectABank')"
          :description="$t('checkingSavingsAndCardsFromEuropeanBanksReadOnlyOver')"
        >
          <template #actions>
            <UButton :to="providerDocs('banks')" target="_blank" color="neutral" variant="link" size="sm" trailing-icon="i-lucide-arrow-up-right" :label="$t('howItWorks')" class="shrink-0" />
          </template>
          <ConnectBankPicker :error="bankError" @dismiss-error="bankFailure = null" />
        </ConnectSection>

        <div class="grid gap-10 sm:grid-cols-2 sm:gap-8">
          <ConnectSection id="manual" icon="i-lucide-pencil-line" :title="$t('manualAccount')" :description="$t('cashAPensionALoanOrAPropertyYouUpdate')">
            <template #actions>
              <UButton color="neutral" variant="outline" icon="i-lucide-plus" :label="$t('add')" class="shrink-0" @click="addManual" />
            </template>
          </ConnectSection>
          <ConnectSection id="import" icon="i-lucide-upload" :title="$t('importACsv')" :description="$t('transactionsExportedFromAnyBankMappedColumnByColumn')">
            <template #actions>
              <UButton color="neutral" variant="outline" icon="i-lucide-file-up" :label="$t('import')" class="shrink-0" @click="importCsv" />
            </template>
          </ConnectSection>
        </div>

        <p class="text-sm text-muted">
          {{ $t('catalogElsewhereCrypto') }} <ULink to="/connect/crypto" class="font-medium text-highlighted underline underline-offset-4">{{ $t('crypto') }}</ULink>.
          {{ $t('catalogElsewhereInvestments') }} <ULink to="/connect/investments" class="font-medium text-highlighted underline underline-offset-4">{{ $t('investments') }}</ULink>.
        </p>
      </div>
    </template>
  </UDashboardPanel>
</template>
