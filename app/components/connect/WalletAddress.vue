<script setup lang="ts">
import type { ConnectionSummary } from "#shared/api"

// A wallet's public address: no keys, nothing to sign. The server checks it's an address of that chain
// (`POST /api/connect/wallet`) and reads its balance right away.
type Chain = "bitcoin" | "ethereum" | "polygon" | "solana" | "xrpl" | "nimiq"
const flow = useConnectFlow()
const demo = useDemoPerson()
const chain = flow.entry.provider as Chain
const PLACEHOLDERS: Record<Chain, () => string> = {
  bitcoin: () => translate('bc1qOr1Or3'),
  ethereum: () => translate('0x'),
  polygon: () => translate('0x'),
  solana: () => translate('base58Address'),
  xrpl: () => translate('r'),
  nimiq: () => translate('nq'),
}
const state = reactive({ address: "", name: "" })
const validate = (values: typeof state) => (values.address.trim() ? [] : [{ name: "address", message: translate('pasteTheWalletSPublicAddress') }])
async function submit() {
  if (demo.value) return
  await flow.connect(
    () =>
      $fetch<ConnectionSummary>("/api/connect/wallet", {
        method: "POST",
        body: { chain, address: state.address.trim(), name: state.name.trim() || undefined },
      }),
    translate('couldnTAddTheWalletCheckTheAddressAndTry'),
  )
}
</script>

<template>
  <UForm :id="flow.formId" :state="state" :validate="validate" :disabled="flow.pending.value" class="flex flex-col gap-4" @submit="submit">
    <UFormField :label="$t('address')" name="address" :help="$t('onlyThePublicAddressNeverPasteASeedPhraseOr')">
      <UInput v-model="state.address" :placeholder="PLACEHOLDERS[chain]()" autocomplete="off" spellcheck="false" autofocus class="w-full" :ui="{ base: 'font-mono' }" />
    </UFormField>
    <UFormField :label="$t('name')" name="name" :hint="$t('optionalHint')">
      <UInput v-model="state.name" :placeholder="$t('coldStorage')" class="w-full" />
    </UFormField>
  </UForm>
</template>
