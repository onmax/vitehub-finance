<script setup lang="ts">
import type { ConnectionSummary } from "#shared/api"

// Watches a public wallet address: its balance, priced in the household's currency. No keys, nothing to sign.
const emit = defineEmits<{ connected: [connection: ConnectionSummary] }>()
type Chain = "bitcoin" | "ethereum" | "solana" | "xrpl"
const CHAINS: Record<Chain, { label: string; placeholder: string; icon: string }> = {
  bitcoin: { label: "Bitcoin", placeholder: "bc1q… or 1… or 3…", icon: "i-simple-icons-bitcoin" },
  ethereum: { label: "Ethereum", placeholder: "0x…", icon: "i-simple-icons-ethereum" },
  solana: { label: "Solana", placeholder: "Base58 address", icon: "i-simple-icons-solana" },
  xrpl: { label: "XRP Ledger", placeholder: "r…", icon: "i-simple-icons-xrp" },
}
const items = (Object.keys(CHAINS) as Chain[]).map((value) => ({ value, label: CHAINS[value].label, icon: CHAINS[value].icon }))
const state = reactive({ chain: "bitcoin" as Chain, address: "", name: "" })
const pending = ref(false)
const error = ref("")
const validate = (values: typeof state) => (values.address.trim() ? [] : [{ name: "address", message: "Paste the wallet’s public address." }])

async function submit() {
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
    error.value = errorText(cause, "Couldn’t add the wallet. Check the address and try again.")
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UForm :state="state" :validate="validate" class="flex flex-col gap-4" @submit="submit">
    <UFormField label="Chain" name="chain">
      <USelect v-model="state.chain" :items="items" class="w-full" />
    </UFormField>
    <UFormField label="Address" name="address" help="Only the public address. Never paste a seed phrase or private key.">
      <UInput v-model="state.address" :placeholder="CHAINS[state.chain].placeholder" autocomplete="off" spellcheck="false" class="w-full" :ui="{ base: 'font-mono' }" />
    </UFormField>
    <UFormField label="Name" name="name" hint="Optional">
      <UInput v-model="state.name" placeholder="Cold storage" class="w-full" />
    </UFormField>
    <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
    <UButton type="submit" color="neutral" variant="outline" label="Add wallet" :loading="pending" class="self-start" />
  </UForm>
</template>
