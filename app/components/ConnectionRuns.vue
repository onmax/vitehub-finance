<script setup lang="ts">
import type { ConnectionSummary, SyncRun } from "#shared/api"

// A connection's last syncs, newest first: when, why, how many transactions came in, and what failed.
const props = defineProps<{ connection: ConnectionSummary }>()
const open = defineModel<boolean>("open", { default: false })
const { data: runs, status, error, refresh } = useScopedFetch<SyncRun[]>(() => `/api/connections/${props.connection.id}/runs`, {
  key: "connection-runs",
  unscoped: true,
  default: () => [],
  immediate: false,
})
watch(open, (value) => value && refresh(), { immediate: true })

const TRIGGERS: Record<SyncRun["trigger"], string> = { schedule: translate('dailySync'), manual: translate('syncedByHand'), link: translate('firstSync') }
function duration(run: SyncRun) {
  if (!run.finishedAt) return null
  const seconds = Math.max(0, Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000))
  return seconds < 60 ? `${seconds} s` : translate('min', { value1: Math.round(seconds / 60) })
}
</script>

<template>
  <USlideover v-model:open="open" :title="$t('syncHistory2', { value1: connection.name })" :description="$t('theLast20SyncsNewestFirst')">
    <template #body>
      <PageError v-if="error" :error="error" @retry="refresh()" />
      <div v-else-if="status === 'pending' && runs.length === 0" class="flex flex-col gap-3">
        <USkeleton v-for="row in 5" :key="row" class="h-14 w-full rounded-lg" />
      </div>
      <p v-else-if="runs.length === 0" class="text-sm text-muted">{{ $t('noSyncsYet') }}</p>
      <ol v-else class="flex flex-col divide-y divide-default">
        <li v-for="run in runs" :key="run.id" class="flex gap-3 py-3">
          <UIcon
            :name="run.status === 'succeeded' ? 'i-lucide-circle-check' : run.status === 'failed' ? 'i-lucide-circle-x' : 'i-lucide-loader-circle'"
            class="mt-0.5 size-4 shrink-0"
            :class="run.status === 'succeeded' ? 'text-success' : run.status === 'failed' ? 'text-error' : 'animate-spin text-muted'"
          />
          <div class="min-w-0 flex-1">
            <p class="flex items-baseline justify-between gap-3 text-sm">
              <span class="font-medium text-highlighted">{{ run.status === "failed" ? $t('failed') : run.status === "running" ? $t('running') : TRIGGERS[run.trigger] }}</span>
              <span class="shrink-0 text-xs text-muted tabular-nums">{{ formatDateTime(run.startedAt) }}</span>
            </p>
            <p class="mt-0.5 text-xs text-muted">
              <template v-if="run.status === 'failed'">{{ TRIGGERS[run.trigger] }}</template>
              <template v-else>
                <span class="tabular-nums">{{ formatCount(run.added) }}</span> {{ $t('newTransactions', run.added) }}
              </template>
              <template v-if="duration(run)"> · <span class="tabular-nums">{{ duration(run) }}</span></template>
            </p>
            <p v-if="run.error" class="mt-1 text-xs text-error text-pretty">{{ providerErrorText(run.error, run.errorCode) }}</p>
          </div>
        </li>
      </ol>
    </template>
  </USlideover>
</template>
