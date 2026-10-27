<script setup lang="ts">
import { AccountCreateModal } from "#components"

// A new household: a still, dimmed chart behind one call to action (Midday's empty dashboard), with the other ways in
// underneath.
const overlay = useOverlay()
const addAccount = overlay.create(AccountCreateModal, { destroyOnClose: true })
// A gentle made-up line, only to show where the chart will be.
const sample = Array.from({ length: 60 }, (_, index) => ({
  date: addDays(today(), index - 59),
  value: 1000 + index * 12 + Math.sin(index / 5) * 60 + Math.cos(index / 2.3) * 25,
}))
const options = [
  { get label() { return translate('addACryptoWallet') }, get description() { return translate('bitcoinEthereumSolanaXrpOrNimiqByAddress') }, icon: "i-lucide-wallet", to: "/connect/crypto#wallet" },
  { get label() { return translate('addAManualAccount') }, get description() { return translate('cashAPensionALoan') }, icon: "i-lucide-plus", action: () => addAccount.open() },
  { get label() { return translate('importACsv') }, get description() { return translate('anyBankSExport') }, icon: "i-lucide-file-up", to: "/connect/banks#import" },
]
</script>

<template>
  <div class="flex flex-col gap-10">
    <section class="relative overflow-hidden border-t border-default">
      <div class="pt-4" aria-hidden="true">
        <p class="text-sm font-medium text-muted">{{ $t('netWorth') }}</p>
        <p class="money mt-1 text-3xl font-semibold tracking-[-0.02em] text-dimmed">—</p>
        <AreaChart class="mt-4" :points="sample" :format="() => ''" :label="$t('sampleChart')" :height="220" dimmed bare />
      </div>
      <div class="absolute inset-0 grid place-items-center bg-default/40 p-4">
        <div class="flex max-w-sm flex-col items-center rounded-xl bg-default/90 p-6 text-center">
          <span class="grid size-10 place-items-center rounded-lg bg-primary/10">
            <UIcon name="i-lucide-landmark" class="size-5 text-primary" />
          </span>
          <h2 class="mt-4 text-base font-semibold text-highlighted">{{ $t('connectYourBank') }}</h2>
          <p class="mt-1 text-sm text-muted"> {{ $t('balancesAndTransactionsComeInThroughYourBankSOwn') }} </p>
          <UButton class="mt-5" to="/connect/banks#bank" :label="$t('connectABank')" icon="i-lucide-plug" />
        </div>
      </div>
    </section>
    <div>
      <h2 class="border-b border-default pb-2 text-sm font-medium text-highlighted">{{ $t('orStartAnotherWay') }}</h2>
      <ul class="mt-2 grid gap-x-4 sm:grid-cols-3">
        <li v-for="option in options" :key="option.label">
          <component
            :is="option.to ? resolveComponent('NuxtLink') : 'button'"
            :to="option.to"
            type="button"
            class="-mx-2 flex h-full w-[calc(100%+1rem)] cursor-pointer items-start gap-3 rounded-lg p-2 py-3 text-left transition-colors duration-150 hover:bg-elevated/60 focus-visible:outline-2 focus-visible:outline-primary"
            @click="option.action?.()"
          >
            <span class="grid size-8 shrink-0 place-items-center rounded-md bg-elevated">
              <UIcon :name="option.icon" class="size-4 text-highlighted" />
            </span>
            <span>
              <span class="block text-sm font-medium text-highlighted">{{ option.label }}</span>
              <span class="block text-sm text-muted">{{ option.description }}</span>
            </span>
          </component>
        </li>
      </ul>
    </div>
  </div>
</template>
