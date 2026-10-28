<script setup lang="ts">
import type { ConnectionSummary } from "#shared/api"
const flow = useConnectFlow()
const demo = useDemoPerson()
const state = reactive({ key: "", name: "" })
const validate = (values: typeof state) => /^rk_live_[a-zA-Z0-9]+$/.test(values.key.trim()) ? [] : [{ name: "key", message: translate("stripeKeyValidation") }]
async function submit() {
  if (demo.value) return
  await flow.connect(() => $fetch<ConnectionSummary>("/api/connect/stripe", {
    method: "POST", body: { key: state.key.trim(), name: state.name.trim() || undefined },
  }), translate("couldnTConnectCheckTheKeyAndTryAgain", { value1: "Stripe" }))
}
</script>

<template>
  <UForm :id="flow.formId" :state="state" :validate="validate" :disabled="flow.pending.value" class="flex flex-col gap-4" @submit="submit">
    <p class="text-sm text-muted">{{ $t('stripeKeyInstructions') }}</p>
    <UFormField :label="$t('stripeRestrictedKey')" name="key" :description="$t('stripeKeyValidation')">
      <template #hint>
        <ULink to="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener" class="text-xs text-highlighted underline underline-offset-4">{{ $t('catalogGetAKey') }}</ULink>
      </template>
      <ConnectSecretInput v-model="state.key" autofocus />
    </UFormField>
    <UFormField :label="$t('name')" name="name" :hint="$t('optionalHint')"><UInput v-model="state.name" placeholder="Stripe" class="w-full" /></UFormField>
    <p class="text-xs text-muted">{{ $t('stripeLedgerHelp') }}</p>
    <p class="flex items-start gap-2 text-xs text-muted"><UIcon name="i-lucide-lock" class="mt-px shrink-0" />{{ $t('stripeKeyStorage') }}</p>
    <ULink to="/docs/providers/stripe" target="_blank" class="self-start text-xs text-highlighted underline underline-offset-4">{{ $t('stripeReadGuide') }}</ULink>
  </UForm>
</template>
