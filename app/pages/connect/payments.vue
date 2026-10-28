<script setup lang="ts">
useHead({ get title() { return translate("payments") } })
</script>

<template>
  <UDashboardPanel id="connect-payments">
    <template #header><PageNavbar :title="$t('payments')" /></template>
    <template #body>
      <ConnectCatalogPage page="/connect/payments" :list-title="$t('yourPaymentConnections')">
        <template #footer>
          <p class="max-w-2xl text-sm text-muted">{{ $t('stripeLedgerHelp') }}</p>
        </template>
      </ConnectCatalogPage>
    </template>
  </UDashboardPanel>
</template>
