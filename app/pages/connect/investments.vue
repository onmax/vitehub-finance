<script setup lang="ts">
// Investments: Interactive Brokers through a read-only Flex token, and the platforms that can't be connected yet, with
// a CSV import for those. `#broker` is Interactive Brokers' anchor from when it lived on /connect/crypto.
useHead({ get title() { return translate('investments') } })
</script>

<template>
  <UDashboardPanel id="connect-investments">
    <template #header>
      <PageNavbar :title="$t('investments')" :scoped="false" />
    </template>
    <template #body>
      <ConnectCatalogPage page="/connect/investments" :list-title="$t('catalogYourInvestmentAccounts')" :aliases="{ broker: 'ibkr' }">
        <template #footer>
          <p class="text-sm text-muted">
            {{ $t('catalogElsewhereBanks') }} <ULink to="/connect/banks" class="font-medium text-highlighted underline underline-offset-4">{{ $t('banks') }}</ULink>.
            {{ $t('catalogElsewhereCrypto') }} <ULink to="/connect/crypto" class="font-medium text-highlighted underline underline-offset-4">{{ $t('crypto') }}</ULink>.
          </p>
        </template>
      </ConnectCatalogPage>
    </template>
  </UDashboardPanel>
</template>
