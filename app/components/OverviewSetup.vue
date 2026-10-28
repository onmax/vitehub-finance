<script setup lang="ts">
import type { SetupStatus } from "#shared/setup"
const { data, error, refresh } = useScopedFetch<SetupStatus>("/api/setup", { key: "setup" })
const { data: me } = useMe()
const notify = useNotify()
const pending = ref(false)
const expanded = ref(false)
const steps = computed(() => {
  if (!data.value) return []
  const state = data.value
  return [
    { key: "account", label: translate("setupAccount"), to: "/connect/banks", done: state.accountCount > 0 },
    { key: "review", label: translate("setupReview"), to: "/transactions?view=needs-review", done: state.transactionCount > 0 && state.needsReview === 0 },
    { key: "sharingReviewed", label: translate("setupSharing"), to: "/accounts", done: state.sharingReviewed },
    { key: "recurringReviewed", label: translate("setupRecurring"), to: "/recurring", done: state.recurringReviewed },
    { key: "plan", label: translate("setupPlan"), to: "/budgets", done: state.planCount > 0 },
    { key: "forecastReviewed", label: translate("setupForecast"), to: "/forecast", done: state.forecastReviewed },
  ]
})
const completed = computed(() => steps.value.filter(step => step.done).length)
const checkedIn = computed(() => data.value?.checkins.find(person => person.userId === me.value?.user.id)?.complete ?? false)
async function save(body: { dismissed?: boolean; sharingReviewed?: boolean; recurringReviewed?: boolean; forecastReviewed?: boolean; checkin?: boolean }) {
  pending.value = true
  try { await $fetch("/api/setup", { method: "PATCH", body }); await refresh() }
  catch (cause) { notify.error(cause) }
  finally { pending.value = false }
}
function acknowledge(key: string) {
  if (key === "sharingReviewed") return save({ sharingReviewed: true })
  if (key === "recurringReviewed") return save({ recurringReviewed: true })
  if (key === "forecastReviewed") return save({ forecastReviewed: true })
}
</script>

<template>
  <PageError v-if="error" :error="error" @retry="refresh()" />
  <div v-else-if="data" class="grid gap-6 lg:grid-cols-2">
    <SectionCard :title="$t('setupTitle')">
      <template #action>
        <DemoLock v-slot="{ locked }">
          <UButton v-if="!data.dismissed || expanded" color="neutral" variant="ghost" :label="$t('setupHide')" :disabled="locked || pending" @click="expanded = false; save({ dismissed: true })" />
          <UButton v-else color="neutral" variant="ghost" :label="$t('setupReopen')" @click="expanded = true" />
        </DemoLock>
      </template>
      <template v-if="!data.dismissed || expanded">
        <p class="mb-3 text-sm text-muted">{{ $t('setupProgress', { completed, total: steps.length }) }}</p>
        <ol class="divide-y divide-default">
          <li v-for="step in steps" :key="step.key" class="flex min-h-11 items-center gap-2 py-1">
            <UIcon :name="step.done ? 'i-lucide-circle-check' : 'i-lucide-circle'" :class="step.done ? 'text-success' : 'text-muted'" aria-hidden="true" class="size-4 shrink-0" />
            <NuxtLink :to="step.to" class="flex-1 rounded-sm text-sm text-default hover:underline focus-visible:outline-2 focus-visible:outline-primary">{{ step.label }}<span v-if="step.done" class="sr-only"> {{ $t('setupDone') }}</span></NuxtLink>
            <DemoLock v-if="!step.done && ['sharingReviewed', 'recurringReviewed', 'forecastReviewed'].includes(step.key)" v-slot="{ locked }">
              <UButton color="neutral" variant="ghost" size="sm" :label="$t('setupAcknowledge')" :disabled="locked || pending" @click="acknowledge(step.key)" />
            </DemoLock>
          </li>
        </ol>
      </template>
      <p v-else class="text-sm text-muted">{{ $t('setupHidden') }}</p>
    </SectionCard>
    <SectionCard :title="$t('monthlyCheckin', { month: formatMonth(data.month) })">
      <p class="text-sm text-muted">{{ $t('monthlyCheckinHelp') }}</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <UButton to="/transactions?view=needs-review" color="neutral" variant="outline" icon="i-lucide-list-checks" :label="$t('setupReviewCount', { count: data.needsReview })" />
        <UButton v-if="data.assignedToMe" to="/transactions?view=assigned-to-me" color="neutral" variant="outline" icon="i-lucide-user-round-check" :label="$t('setupAssignedCount', { count: data.assignedToMe })" />
      </div>
      <ul class="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <li v-for="person in data.checkins" :key="person.userId" class="flex items-center gap-1.5">
          <UIcon :name="person.complete ? 'i-lucide-circle-check' : 'i-lucide-circle'" :class="person.complete ? 'text-success' : 'text-muted'" aria-hidden="true" class="size-4" />
          <span>{{ person.name }} · {{ $t(person.complete ? 'checkinComplete' : 'checkinPending') }}</span>
        </li>
      </ul>
      <DemoLock v-slot="{ locked }">
        <UButton class="mt-4 self-start" color="neutral" variant="outline" :label="$t(checkedIn ? 'checkinUndo' : 'checkinFinish')" :loading="pending" :disabled="locked" @click="save({ checkin: !checkedIn })" />
      </DemoLock>
    </SectionCard>
  </div>
</template>
