<script setup lang="ts">
// Interactive Brokers, step 1: what the connection reads and that its token can't trade, before anything is asked.
const flow = useConnectFlow()
</script>

<template>
  <UForm :id="flow.formId" :state="{}" class="flex flex-col gap-5" @submit="flow.next()">
    <p class="text-sm text-pretty text-toned">{{ $t('catalogIbkrIntro') }}</p>
    <ConnectFacts :entry="flow.entry" />
    <ULink :to="flow.entry.docs ?? undefined" target="_blank" rel="noopener" class="inline-flex items-center gap-1 self-start text-sm font-medium text-highlighted underline-offset-4 hover:underline">
      {{ $t('catalogIbkrFlexGuide') }}<UIcon name="i-lucide-arrow-up-right" class="size-3.5" />
    </ULink>
  </UForm>
</template>
