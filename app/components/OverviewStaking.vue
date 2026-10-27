<script setup lang="ts">
import type { Overview } from "#shared/api"

// How much of net worth is staked, per account that stakes, and the rewards identified so far. Both are already in net
// worth; the value is today's price for the staked coins.
defineProps<{ overview: Overview }>()
const { format } = useMoney()
</script>

<template>
  <SectionCard :title="$t('overviewStaking')">
    <ul class="flex flex-col divide-y divide-default">
      <li v-for="row in overview.staking" :key="row.accountId">
        <NuxtLink :to="`/accounts/${row.accountId}`" class="flex min-h-12 items-center gap-3 py-2 hover:text-highlighted">
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm text-highlighted">{{ row.accountName }}</span>
            <span class="block truncate text-xs text-muted tabular-nums">{{ $t('overviewStakingStaked', { value1: `${formatCoins(row.staked, 2)} ${row.symbol}` }) }}</span>
            <span class="block truncate text-xs text-muted tabular-nums">{{ $t('overviewStakingRewards', { value1: `${formatCoins(row.rewards, 2)} ${row.symbol}` }) }}</span>
          </span>
          <span v-if="row.stakedValueMinor !== null" class="money shrink-0 text-sm text-highlighted">{{ format(row.stakedValueMinor, overview.currency) }}</span>
        </NuxtLink>
      </li>
    </ul>
  </SectionCard>
</template>
