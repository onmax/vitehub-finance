<script setup lang="ts">
// A command, URL, or config to paste elsewhere, with a copy button. `label` names it for the button and screen readers.
const props = defineProps<{ code: string; label: string; multiline?: boolean; wrap?: boolean }>()
const { copy, copied } = useClipboard({ copiedDuring: 1500, legacy: true })
</script>

<template>
  <div class="group relative flex items-start gap-2 rounded-lg border border-default bg-muted">
    <pre
      class="min-w-0 flex-1 overflow-x-auto px-3 py-2.5 font-mono text-[13px] leading-5 text-highlighted"
      :class="wrap ? 'whitespace-pre-wrap break-all' : multiline ? 'whitespace-pre' : 'whitespace-nowrap'"
    ><code>{{ props.code }}</code></pre>
    <UTooltip :text="copied ? 'Copied' : `Copy ${label}`">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        class="m-1 shrink-0"
        :icon="copied ? 'i-lucide-copy-check' : 'i-lucide-copy'"
        :aria-label="copied ? 'Copied' : `Copy ${label}`"
        @click="copy(props.code)"
      />
    </UTooltip>
  </div>
</template>
