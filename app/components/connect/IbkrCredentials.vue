<script setup lang="ts">
import type { ConnectionSummary } from "#shared/api"

// Interactive Brokers, step 4: the token and the Query ID. The server runs the query once before saving
// (`POST /api/connect/broker`), so a wrong token or query fails here with IBKR's reason.
const flow = useConnectFlow()
const demo = useDemoPerson()
const state = reactive({ token: "", queryId: "", name: "" })
const validate = (values: typeof state) => [
  ...(values.token.trim() ? [] : [{ name: "token", message: translate('pasteTheFlexToken') }]),
  ...(/^\d+$/.test(values.queryId.trim()) ? [] : [{ name: "queryId", message: translate('theQueryIdIsANumber') }]),
]
async function submit() {
  if (demo.value) return
  await flow.connect(
    () =>
      $fetch<ConnectionSummary>("/api/connect/broker", {
        method: "POST",
        body: { provider: "ibkr", token: state.token.trim(), queryId: state.queryId.trim(), name: state.name.trim() || undefined },
      }),
    translate('couldnTConnectInteractiveBrokersCheckTheTokenAndThe'),
  )
}
</script>

<template>
  <UForm :id="flow.formId" :state="state" :validate="validate" :disabled="flow.pending.value" class="flex flex-col gap-4" @submit="submit">
    <UFormField :label="$t('flexToken')" name="token">
      <ConnectSecretInput v-model="state.token" autofocus />
    </UFormField>
    <UFormField :label="$t('queryId')" name="queryId" :help="$t('catalogQueryIdHelp')">
      <UInput v-model="state.queryId" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="987654" class="w-full" :ui="{ base: 'font-mono' }" />
    </UFormField>
    <UFormField :label="$t('name')" name="name" :hint="$t('optionalHint')">
      <UInput v-model="state.name" :placeholder="$t('interactiveBrokersLucA')" class="w-full" />
    </UFormField>
    <p class="text-xs text-muted">{{ $t('catalogIbkrCheckNote') }}</p>
  </UForm>
</template>
