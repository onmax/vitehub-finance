<script setup lang="ts">
import type { ConnectionSummary } from "#shared/api"

// Watches a public wallet address: its balance, priced in the household's currency. No keys, nothing to sign.
const emit = defineEmits<{ connected: [connection: ConnectionSummary] }>()
type Chain = "bitcoin" | "ethereum" | "solana" | "xrpl" | "nimiq"
const CHAINS: Record<Chain, { label: string; placeholder: string; icon: string }> = {
  bitcoin: { label: "Bitcoin", placeholder: translate('bc1qOr1Or3'), icon: "i-simple-icons-bitcoin" },
  ethereum: { label: "Ethereum", placeholder: translate('0x'), icon: "i-simple-icons-ethereum" },
  solana: { label: "Solana", placeholder: translate('base58Address'), icon: "i-simple-icons-solana" },
  xrpl: { label: "XRP Ledger", placeholder: translate('r'), icon: "i-simple-icons-xrp" },
  nimiq: { label: "Nimiq", placeholder: translate('nq'), icon: "i-finance-nimiq" },
}
const items = (Object.keys(CHAINS) as Chain[]).map((value) => ({ value, label: CHAINS[value].label, icon: CHAINS[value].icon }))
const state = reactive({ chain: "bitcoin" as Chain, address: "", name: "" })
const pending = ref(false)
const error = ref("")
const validate = (values: typeof state) => (values.address.trim() ? [] : [{ name: "address", message: translate('pasteTheWalletSPublicAddress') }])

// The demo links nothing real (the server refuses too).
const demo = useDemo()

async function submit() {
  if (demo) return
  pending.value = true
  error.value = ""
  try {
    const connection = await $fetch<ConnectionSummary>("/api/connect/wallet", {
      method: "POST",
      body: { chain: state.chain, address: state.address.trim(), name: state.name.trim() || undefined },
    })
    Object.assign(state, { address: "", name: "" })
    emit("connected", connection)
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTAddTheWalletCheckTheAddressAndTry'))
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UForm :state="state" :validate="validate" class="flex flex-col gap-4" @submit="submit">
    <UFormField :label="$t('chain')" name="chain">
      <USelect v-model="state.chain" :items="items" class="w-full" />
    </UFormField>
    <UFormField :label="$t('address')" name="address" :help="$t('onlyThePublicAddressNeverPasteASeedPhraseOr')">
      <UInput v-model="state.address" :placeholder="CHAINS[state.chain].placeholder" autocomplete="off" spellcheck="false" class="w-full" :ui="{ base: 'font-mono' }" />
    </UFormField>
    <UFormField :label="$t('name')" name="name" hint="Optional">
      <UInput v-model="state.name" :placeholder="$t('coldStorage')" class="w-full" />
    </UFormField>
    <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
    <DemoLock v-slot="{ locked }" class="self-start">
      <UButton :disabled="locked" type="submit" color="neutral" variant="outline" :label="$t('addWallet')" :loading="pending" class="self-start" />
    </DemoLock>
  </UForm>
</template>
