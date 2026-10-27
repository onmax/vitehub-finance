<script setup lang="ts">
// Interactive Brokers, step 3: the Flex Web Service token, which can only fetch Flex Queries.
const flow = useConnectFlow()
const steps = computed(() => [translate('catalogIbkrTokenStep1'), translate('catalogIbkrTokenStep2'), translate('catalogIbkrTokenStep3'), translate('catalogIbkrTokenStep4')])
</script>

<template>
  <UForm :id="flow.formId" :state="{}" class="flex flex-col gap-4" @submit="flow.next()">
    <ConnectHowTo
      :summary="$t('catalogIbkrTokenSummary')"
      :steps="steps"
      :guide="{ label: $t('catalogIbkrFlexGuide'), to: flow.entry.docs ?? '' }"
    />
    <p class="flex gap-2 text-xs text-muted">
      <UIcon name="i-lucide-lock" class="mt-px size-3.5 shrink-0" />{{ $t('theTokenIsStoredEncryptedAFlexTokenOnlyReads') }}
    </p>
  </UForm>
</template>
