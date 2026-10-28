<script setup lang="ts">
import type { SetupStatus } from "#shared/setup"
const { data, error, refresh } = useScopedFetch<SetupStatus>("/api/setup", { key: "setup" })
const { data: me } = useMe()
const notify = useNotify()
const pending = ref(false)
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
  <div v-else-if="data" class="grid items-start gap-6 rounded-lg border border-default bg-muted/40 p-4 sm:p-5 lg:grid-cols-2 lg:gap-8">
    <OverviewSetupChecklist :steps="steps" :completed="completed" :dismissed="data.dismissed" :pending="pending" @dismiss="save({ dismissed: true })" @acknowledge="acknowledge" />
    <OverviewCheckin :data="data" :checked-in="checkedIn" :pending="pending" @toggle="save({ checkin: !checkedIn })" />
  </div>
</template>
