<script setup lang="ts">
// The overview: net worth and its 90 days, this month against the last, where the money went, what's due soon,
// connections that need someone, and the latest transactions. A new household sees how to start instead.
useHead({ title: "Overview" })
const { data: overview, status, error, refresh } = useOverview()
const { data: me } = useMe()
const greeting = computed(() => {
  const hour = new Date().getHours()
  const name = me.value?.user.name.split(" ")[0]
  const part = hour < 12 ? "Good morning" : hour < 19 ? "Good afternoon" : "Good evening"
  return name ? `${part}, ${name}` : part
})
const empty = computed(() => overview.value && overview.value.accountCount === 0)
</script>

<template>
  <UDashboardPanel id="overview">
    <template #header>
      <PageNavbar title="Overview">
        <template #right>
          <UButton v-if="overview && !empty" to="/connect" icon="i-lucide-plus" label="Connect" color="neutral" variant="outline" class="hidden sm:inline-flex" />
        </template>
      </PageNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <h1 class="text-xl font-semibold text-highlighted sm:text-2xl">{{ greeting }}</h1>

        <PageError v-if="error && !overview" :error="error" @retry="refresh()" />
        <OverviewSkeleton v-else-if="!overview && status !== 'error'" />
        <OverviewEmpty v-else-if="empty" />
        <template v-else-if="overview">
          <OverviewAttention v-if="overview.attention.length" :connections="overview.attention" />
          <div class="grid gap-6 lg:grid-cols-3">
            <OverviewNetWorth :overview="overview" class="lg:col-span-2" />
            <OverviewMonth :overview="overview" />
            <div class="flex flex-col gap-6">
              <OverviewSpending :overview="overview" />
              <OverviewUpcoming :overview="overview" />
            </div>
            <OverviewRecent :overview="overview" class="lg:col-span-2" />
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
