<script setup lang="ts">
import type { ConnectionSummary } from "#shared/api"

// Interactive Brokers on one screen: where in IBKR to go (the Client Portal first, its docs beside it), the two things
// to make there (an Activity Flex Query, which IBKR's Configure with AI can build from our prompt, and a Flex Web
// Service token), then the two values to paste. The server runs the query once before saving
// (`POST /api/connect/broker`), so a wrong token or query fails here with IBKR's reason. A new token for a query that's
// already connected renews that connection.
const flow = useConnectFlow()
const demo = useDemoPerson()
const PORTAL = "https://www.interactivebrokers.com/portal/"
const state = reactive({ token: "", queryId: "" })
const validate = (values: typeof state) => [
  ...(values.token.trim() ? [] : [{ name: "token", message: translate('pasteTheFlexToken') }]),
  ...(/^\d+$/.test(values.queryId.trim()) ? [] : [{ name: "queryId", message: translate('theQueryIdIsANumber') }]),
]
const querySteps = computed(() => [
  translate('catalogIbkrQueryStep1'),
  translate('catalogIbkrQueryStep2'),
  translate('catalogIbkrQueryStep3'),
  translate('catalogIbkrQueryStep4'),
  translate('catalogIbkrQueryStep5'),
])
const tokenSteps = computed(() => [translate('catalogIbkrTokenStep1'), translate('catalogIbkrTokenStep2'), translate('catalogIbkrTokenStep3'), translate('catalogIbkrTokenStep4')])
// In English whatever the app's language: it names IBKR's sections and fields as IBKR does. It asks for what
// @vitehub-finance/brokers reads (OpenPosition and CashReportCurrency rows).
const PROMPT = "Create an Activity Flex Query named ViteHub Finance with two sections and nothing else. Open Positions at the Summary level of detail, with all fields, including Account ID, Currency, Asset Class, Symbol, Description, Conid, ISIN, Quantity, Mark Price, and Position Value. Cash Report per currency, with all fields, including Currency and Ending Cash. Format: XML. Period: Last Business Day. Keep Display Account Alias in Place of Account ID and Breakout by Day on No, and add no filters."
const { copy, copied } = useClipboard({ copiedDuring: 1500, legacy: true })

async function submit() {
  if (demo.value) return
  await flow.connect(
    () =>
      $fetch<ConnectionSummary>("/api/connect/broker", {
        method: "POST",
        body: { provider: "ibkr", token: state.token.trim(), queryId: state.queryId.trim() },
      }),
    translate('couldnTConnectInteractiveBrokersCheckTheTokenAndThe'),
  )
}
</script>

<template>
  <UForm :id="flow.formId" :state="state" :validate="validate" :disabled="flow.pending.value" class="flex flex-col gap-4" @submit="submit">
    <div class="flex flex-col gap-2.5">
      <p class="text-sm text-pretty text-toned">{{ $t('catalogIbkrWhere') }}</p>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton :to="PORTAL" target="_blank" rel="noopener" color="neutral" variant="outline" trailing-icon="i-lucide-arrow-up-right" :label="$t('catalogIbkrOpenPortal')" />
        <ULink :to="flow.entry.docs ?? undefined" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs font-medium text-muted underline-offset-4 hover:text-highlighted hover:underline">
          {{ $t('catalogIbkrDocs') }}<UIcon name="i-lucide-arrow-up-right" class="size-3" />
        </ULink>
      </div>
    </div>

    <ConnectHowTo :summary="`1. ${$t('catalogIbkrQuerySummary')}`" :steps="querySteps">
      <p class="flex flex-wrap items-center gap-x-1.5 px-3 text-xs text-muted">
        <UIcon name="i-lucide-sparkles" class="size-3.5 shrink-0" />{{ $t('catalogIbkrAiShort') }}
        <UButton color="neutral" variant="link" size="xs" class="px-0" :icon="copied ? 'i-lucide-copy-check' : 'i-lucide-copy'" :label="copied ? $t('copied') : $t('catalogIbkrAiCopy')" @click="copy(PROMPT)" />
      </p>
    </ConnectHowTo>
    <ConnectHowTo :summary="`2. ${$t('catalogIbkrTokenSummary')}`" :steps="tokenSteps" />

    <UFormField :label="$t('flexToken')" name="token" :help="$t('catalogIbkrTokenRenew')">
      <ConnectSecretInput v-model="state.token" />
    </UFormField>
    <UFormField :label="$t('queryId')" name="queryId" :help="$t('catalogQueryIdHelp')">
      <UInput v-model="state.queryId" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="987654" class="w-full" :ui="{ base: 'font-mono' }" />
    </UFormField>
    <p class="flex gap-2 text-xs text-muted">
      <UIcon name="i-lucide-lock" class="mt-px size-3.5 shrink-0" />{{ $t('theTokenIsStoredEncryptedAFlexTokenOnlyReads') }} {{ $t('catalogIbkrCheckNote') }}
    </p>
  </UForm>
</template>
