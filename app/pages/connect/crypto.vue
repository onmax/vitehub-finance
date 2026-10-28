<script setup lang="ts">
// Crypto: exchanges with read-only keys and public wallets, the connections already made on top. Interactive Brokers
// moved to /connect/investments; its old anchor follows it there.
definePageMeta({
  middleware: (to) => (to.hash === "#broker" ? navigateTo({ path: "/connect/investments", query: to.query, hash: to.hash }, { replace: true }) : undefined),
})
useHead({ get title() { return translate('crypto') } })
</script>

<template>
  <UDashboardPanel id="connect-crypto">
    <template #header>
      <PageNavbar :title="$t('crypto')" />
    </template>
    <template #body>
      <ConnectCatalogPage page="/connect/crypto" :list-title="$t('catalogYourExchangesAndWallets')">
        <template #footer>
          <p class="text-sm text-muted">
            {{ $t('catalogElsewhereBanks') }} <ULink to="/connect/banks" class="font-medium text-highlighted underline underline-offset-4">{{ $t('banks') }}</ULink>.
            {{ $t('catalogElsewhereInvestments') }} <ULink to="/connect/investments" class="font-medium text-highlighted underline underline-offset-4">{{ $t('investments') }}</ULink>.
          </p>
        </template>
      </ConnectCatalogPage>
    </template>
  </UDashboardPanel>
</template>
