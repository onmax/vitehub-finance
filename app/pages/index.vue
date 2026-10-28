<script setup lang="ts">
// The overview: net worth and its 90 days, this month against the last, the month's money flow, where the money went,
// what's due soon, connections that need someone, and the latest transactions. A new household sees how to start instead.
useHead({ get title() { return translate('overview') } })
const { data: overview, status, error, refresh } = useOverview()
const { data: me } = useMe()
const greeting = computed(() => {
  const hour = new Date().getHours()
  const name = me.value?.user.name.split(" ")[0]
  const part = hour < 12 ? translate('goodMorning') : hour < 19 ? translate('goodAfternoon') : translate('goodEvening')
  return name ? `${part}, ${name}` : part
})
const empty = computed(() => overview.value && overview.value.accountCount === 0)
</script>

<template>
  <UDashboardPanel id="overview">
    <template #header>
      <PageNavbar :title="$t('overview')">
        <template #right>
          <UButton v-if="overview && !empty" to="/connect/banks" icon="i-lucide-plus" :label="$t('connect2')" color="neutral" variant="outline" class="hidden sm:inline-flex" />
        </template>
      </PageNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <h1 class="text-xl font-semibold text-highlighted sm:text-2xl">{{ greeting }}</h1>

        <PageError v-if="error && !overview" :error="error" @retry="refresh()" />
        <OverviewSkeleton v-else-if="!overview && status !== 'error'" />
        <OverviewEmpty v-else-if="empty" />
        <template v-else-if="overview">
          <div class="grid gap-x-10 gap-y-12 lg:grid-cols-3">
            <OverviewNetWorth :overview="overview" class="lg:col-span-2" />
            <OverviewMonth :overview="overview" />
            <OverviewSetup class="lg:col-span-3" />
            <OverviewFlow class="lg:col-span-3" />
            <div class="flex flex-col gap-12">
              <OverviewSpending :overview="overview" />
              <OverviewUpcoming :overview="overview" />
              <OverviewStaking v-if="overview.staking?.length" :overview="overview" />
            </div>
            <OverviewRecent :overview="overview" class="lg:col-span-2" />
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
