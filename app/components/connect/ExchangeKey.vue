<script setup lang="ts">
import type { ConnectionSummary } from "#shared/api"

// An exchange's read-only API key. The fields come first, so a key already on the clipboard goes straight in; how to
// create one folds under them. The server tries the key before saving it (`POST /api/connect/exchange`).
type Exchange = "kraken" | "binance" | "coinbase"
const flow = useConnectFlow()
const demo = useDemoPerson()
const provider = flow.entry.provider as Exchange
const LABELS: Record<Exchange, { key: () => string; secret: () => string }> = {
  kraken: { key: () => translate('apiKey'), secret: () => translate('privateKey') },
  binance: { key: () => translate('apiKey'), secret: () => translate('secretKey') },
  coinbase: { key: () => translate('keyName'), secret: () => translate('privateKey') },
}
const labels = LABELS[provider]
const state = reactive({ key: "", secret: "", name: "" })
const validate = (values: typeof state) => [
  ...(values.key.trim() ? [] : [{ name: "key", message: translate('pasteThe', { value1: labels.key().toLowerCase() }) }]),
  ...(values.secret.trim() ? [] : [{ name: "secret", message: translate('pasteThe', { value1: labels.secret().toLowerCase() }) }]),
]
async function submit() {
  if (demo.value) return
  await flow.connect(
    () =>
      $fetch<ConnectionSummary>("/api/connect/exchange", {
        method: "POST",
        body: { provider, key: state.key.trim(), secret: state.secret.trim(), name: state.name.trim() || undefined },
      }),
    translate('couldnTConnectCheckTheKeyAndTryAgain', { value1: flow.entry.name }),
  )
}
</script>

<template>
  <UForm :id="flow.formId" :state="state" :validate="validate" :disabled="flow.pending.value" class="flex flex-col gap-4" @submit="submit">
    <UFormField :label="labels.key()" name="key">
      <template #hint>
        <ULink :to="flow.entry.docs ?? undefined" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs font-medium text-highlighted underline-offset-4 hover:underline">
          {{ $t('catalogGetAKey') }}<UIcon name="i-lucide-arrow-up-right" class="size-3" />
        </ULink>
      </template>
      <UInput v-model="state.key" autocomplete="off" spellcheck="false" autofocus class="w-full" :ui="{ base: 'font-mono' }" />
    </UFormField>
    <UFormField :label="labels.secret()" name="secret">
      <ConnectSecretInput v-model="state.secret" :multiline="provider === 'coinbase'" />
    </UFormField>
    <UFormField :label="$t('name')" name="name" :hint="$t('optionalHint')">
      <UInput v-model="state.name" :placeholder="`${flow.entry.name} (Lucía)`" class="w-full" />
    </UFormField>
    <ConnectHowTo :summary="$t('catalogReadOnlyKeySummary')" :steps="[flow.entry.authDetail]" />
    <p class="flex gap-2 text-xs text-muted">
      <UIcon name="i-lucide-lock" class="mt-px size-3.5 shrink-0" />{{ $t('theKeyIsStoredEncryptedAndOnlyUsedToRead') }}
    </p>
  </UForm>
</template>
