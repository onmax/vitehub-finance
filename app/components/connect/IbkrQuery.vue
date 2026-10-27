<script setup lang="ts">
// Interactive Brokers, step 2: the Activity Flex Query that decides what's read. IBKR's Configure with AI builds it from
// a prompt, so that comes first; the exact clicks fold under it. Continuing asks for a "done", so nobody reaches the
// token step without the query its Query ID comes from.
const flow = useConnectFlow()
const state = reactive({ done: flow.draft.queryDone === true })
const steps = computed(() => [
  translate('catalogIbkrQueryStep1'),
  translate('catalogIbkrQueryStep2'),
  translate('catalogIbkrQueryStep3'),
  translate('catalogIbkrQueryStep4'),
  translate('catalogIbkrQueryStep5'),
])
// In English whatever the app's language: it names IBKR's sections and fields as IBKR does. It asks for what
// @vitehub-finance/brokers reads (OpenPosition and CashReportCurrency rows).
const PROMPT = "Create an Activity Flex Query named ViteHub Finance with two sections and nothing else. Open Positions at the Summary level of detail, with all fields, including Account ID, Currency, Asset Class, Symbol, Description, Conid, ISIN, Quantity, Mark Price, and Position Value. Cash Report per currency, with all fields, including Currency and Ending Cash. Format: XML. Period: Last Business Day."
const { copy, copied } = useClipboard({ copiedDuring: 1500, legacy: true })
const validate = (values: typeof state) => (values.done ? [] : [{ name: "done", message: translate('catalogTickOnceTheQueryIsSaved') }])
function submit() {
  flow.draft.queryDone = true
  flow.next()
}
</script>

<template>
  <UForm :id="flow.formId" :state="state" :validate="validate" class="flex flex-col gap-4" @submit="submit">
    <p class="text-sm text-pretty text-toned">{{ $t('catalogIbkrQuerySummary') }}</p>
    <section class="flex flex-col gap-3 rounded-lg border border-default bg-elevated/40 p-3" :aria-label="$t('catalogIbkrAiTitle')">
      <div class="flex flex-col gap-1">
        <h3 class="flex items-center gap-1.5 text-sm font-medium text-highlighted"><UIcon name="i-lucide-sparkles" class="size-4 shrink-0 text-muted" />{{ $t('catalogIbkrAiTitle') }}</h3>
        <p class="text-sm text-pretty text-muted">{{ $t('catalogIbkrAiBody') }}</p>
      </div>
      <blockquote lang="en" class="rounded-md bg-muted px-3 py-2.5 text-[13px] leading-5 text-pretty text-highlighted">{{ PROMPT }}</blockquote>
      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        class="self-start"
        :icon="copied ? 'i-lucide-copy-check' : 'i-lucide-copy'"
        :label="copied ? $t('copied') : $t('catalogIbkrAiCopy')"
        @click="copy(PROMPT)"
      />
    </section>
    <ConnectHowTo
      :summary="$t('catalogIbkrAiManual')"
      :steps="steps"
      :guide="{ label: $t('catalogIbkrQueryGuide'), to: 'https://www.ibkrguides.com/clientportal/performanceandstatements/activityflex.htm' }"
    />
    <UFormField name="done">
      <UCheckbox v-model="state.done" :label="$t('catalogIbkrQueryDone')" :description="$t('catalogIbkrQueryDoneHelp')" />
    </UFormField>
  </UForm>
</template>
