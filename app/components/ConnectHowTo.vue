<script setup lang="ts">
// Exact instructions, folded under a one-line summary: people who know the way skip them, the rest open the numbered
// list. The default slot goes under the summary (a shortcut), the provider's own guide under the list.
const props = defineProps<{ summary: string; steps: string[]; guide?: { label: string; to: string } | null; defaultOpen?: boolean }>()
const open = ref(props.defaultOpen ?? false)
</script>

<template>
  <div class="rounded-lg border border-default bg-elevated/40">
    <p class="px-3 pt-3 text-sm text-pretty text-toned">{{ summary }}</p>
    <div v-if="$slots.default" class="pt-2"><slot /></div>
    <UCollapsible v-model:open="open" :ui="{ content: 'px-3' }">
      <UButton
        color="neutral"
        variant="link"
        size="sm"
        class="mx-1.5 my-1 px-1.5"
        :trailing-icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        :label="open ? $t('catalogHideTheSteps') : $t('catalogShowTheSteps')"
      />
      <template #content>
        <ol class="flex list-decimal flex-col gap-2 ps-5 pb-3 text-sm text-pretty text-muted marker:font-mono marker:text-xs marker:text-dimmed">
          <li v-for="item in steps" :key="item">{{ item }}</li>
        </ol>
      </template>
    </UCollapsible>
    <div v-if="guide" class="border-t border-default px-3 py-2">
      <ULink :to="guide.to" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs font-medium text-highlighted underline-offset-4 hover:underline">
        {{ guide.label }}<UIcon name="i-lucide-arrow-up-right" class="size-3" />
      </ULink>
    </div>
  </div>
</template>
