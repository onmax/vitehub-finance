<script setup lang="ts">
const props = defineProps<{ steps: { key: string; label: string; to: string; done: boolean }[]; completed: number; dismissed: boolean; pending: boolean }>()
defineEmits<{ dismiss: []; acknowledge: [key: string] }>()
const expanded = ref(false)
const reopened = ref(false)
const id = useId()
const visible = computed(() => !props.dismissed || reopened.value)
const next = computed(() => props.steps.find(step => !step.done))
const shown = computed(() => expanded.value ? props.steps : next.value ? [next.value] : [])
function collapse() {
  expanded.value = false
  reopened.value = false
}
</script>

<template>
  <section :aria-labelledby="`${id}-title`" class="min-w-0">
    <header class="flex min-h-9 items-center justify-between gap-2">
      <h2 :id="`${id}-title`" class="text-sm font-medium text-highlighted">{{ $t('setupTitle') }}</h2>
      <DemoLock v-if="visible" v-slot="{ locked }">
        <UButton color="neutral" variant="ghost" size="sm" :label="$t('setupHide')" :disabled="locked || pending" @click="collapse(); $emit('dismiss')" />
      </DemoLock>
      <UButton v-else color="neutral" variant="ghost" size="sm" :label="$t('setupReopen')" @click="reopened = true" />
    </header>
    <template v-if="visible">
      <p class="text-xs text-muted tabular-nums">{{ $t('setupProgress', { completed, total: steps.length }) }}</p>
      <ol :id="id" class="mt-2 divide-y divide-default">
        <li v-for="step in shown" :key="step.key" class="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
          <UIcon :name="step.done ? 'i-lucide-circle-check' : 'i-lucide-circle'" :class="step.done ? 'text-success' : 'text-muted'" aria-hidden="true" class="shrink-0 text-sm" />
          <NuxtLink :to="step.to" class="min-w-0 flex-1 rounded-sm py-1 text-sm text-default hover:underline focus-visible:outline-2 focus-visible:outline-primary">{{ step.label }}<span v-if="step.done" class="sr-only"> {{ $t('setupDone') }}</span></NuxtLink>
          <DemoLock v-if="!step.done && ['sharingReviewed', 'recurringReviewed', 'forecastReviewed'].includes(step.key)" v-slot="{ locked }">
            <UButton color="neutral" variant="outline" size="sm" :label="$t('setupAcknowledge')" :disabled="locked || pending" @click="$emit('acknowledge', step.key)" />
          </DemoLock>
        </li>
      </ol>
      <p v-if="!next" class="mt-2 text-sm text-muted">{{ $t('setupAllDone') }}</p>
      <UButton color="neutral" variant="link" size="sm" class="mt-1 -ms-2.5 min-h-9 text-muted" :trailing-icon="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" :label="$t(expanded ? 'setupFewerSteps' : 'setupAllSteps')" :aria-expanded="expanded" :aria-controls="id" @click="expanded = !expanded" />
    </template>
    <p v-else class="text-sm text-muted">{{ $t('setupHidden') }}</p>
  </section>
</template>
