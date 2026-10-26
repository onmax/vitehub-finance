<script setup lang="ts">
// Crypto and investments: exchanges with read-only keys, public wallets, and Interactive Brokers' read-only Flex token,
// with the connections already made on top.
useHead({ title: "Crypto & investments" })
const { connections, status, error, refresh, highlight, connected } = useConnectPage("/connect/crypto")
</script>

<template>
  <UDashboardPanel id="connect-crypto">
    <template #header>
      <PageNavbar title="Crypto & investments" :scoped="false" />
    </template>
    <template #body>
      <div class="mx-auto flex w-full max-w-4xl flex-col gap-10">
        <section v-if="error || connections.length || status === 'pending'" aria-labelledby="connections-title" class="flex flex-col gap-1">
          <div class="flex items-baseline justify-between gap-3">
            <h2 id="connections-title" class="text-sm font-medium text-highlighted">Your exchanges, wallets, and brokers</h2>
            <p v-if="connections.length" class="text-xs text-muted">Synced daily</p>
          </div>
          <PageError v-if="error" :error="error" title="Couldn’t load your connections" @retry="refresh()" />
          <ConnectionList v-else :connections="connections" :loading="status === 'pending'" :highlight="highlight" @changed="refresh()" />
        </section>

        <div class="grid items-start gap-10 lg:grid-cols-2 lg:gap-8">
          <ConnectSection id="exchange" icon="i-lucide-bitcoin" title="Crypto exchange" description="Balances from Kraken, Binance, or Coinbase with a read-only API key.">
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
          <ConnectSection
            id="broker"
            icon="i-lucide-chart-candlestick"
            title="Interactive Brokers"
            description="Stocks, ETFs, and cash at Interactive Brokers, valued at IBKR’s own prices, through a read-only Flex token."
          >
            <ConnectBrokerForm @connected="connected" />
          </ConnectSection>
        </div>

        <p class="text-sm text-muted">
          Bank accounts, manual accounts, and CSV imports are under
          <ULink to="/connect/banks" class="font-medium text-highlighted underline underline-offset-4">Banks</ULink>.
        </p>
      </div>
    </template>
  </UDashboardPanel>
</template>
