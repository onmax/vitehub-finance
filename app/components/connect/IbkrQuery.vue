<script setup lang="ts">
// Interactive Brokers, step 2: the Activity Flex Query that decides what's read. The exact clicks fold under a summary;
// continuing asks for a "done", so nobody reaches the token step without the query its Query ID comes from.
const flow = useConnectFlow()
const state = reactive({ done: flow.draft.queryDone === true })
const steps = computed(() => [
  translate('catalogIbkrQueryStep1'),
  translate('catalogIbkrQueryStep2'),
  translate('catalogIbkrQueryStep3'),
  translate('catalogIbkrQueryStep4'),
  translate('catalogIbkrQueryStep5'),
])
const validate = (values: typeof state) => (values.done ? [] : [{ name: "done", message: translate('catalogTickOnceTheQueryIsSaved') }])
function submit() {
  flow.draft.queryDone = true
  flow.next()
}
</script>

<template>
  <UForm :id="flow.formId" :state="state" :validate="validate" class="flex flex-col gap-4" @submit="submit">
    <ConnectHowTo
      :summary="$t('catalogIbkrQuerySummary')"
      :steps="steps"
      :guide="{ label: $t('catalogIbkrQueryGuide'), to: 'https://www.ibkrguides.com/clientportal/performanceandstatements/activityflex.htm' }"
    />
    <UFormField name="done">
      <UCheckbox v-model="state.done" :label="$t('catalogIbkrQueryDone')" :description="$t('catalogIbkrQueryDoneHelp')" />
    </UFormField>
  </UForm>
</template>
