<script setup lang="ts">
import type { StakingAmount, StakingEventKind, StakingView } from "#shared/api"

// A wallet's staking, read from public data: its balances by state (all already in the holdings above), the validator,
// the rewards it could identify per month, and the principal it moved in and out. What the data can't tell stays
// "Unknown": unpaid rewards, profit, and APY. Money values are today's price for the coins, never what they were worth
// when they arrived, and identified rewards are a subset, not lifetime earnings.
const props = defineProps<{ staking: StakingView; currency: string }>()
const { format } = useMoney()

const coins = (key: StakingAmount) => `${formatCoins(props.staking.amounts[key], 5)} ${props.staking.symbol}`
const worth = (key: StakingAmount) => {
  const minor = props.staking.values?.[key]
  return minor === null || minor === undefined ? null : format(minor, props.currency)
}

const balances = computed(() => [
  { key: "liquid" as const, label: translate('stakingLiquid'), help: translate('stakingLiquidHelp') },
  { key: "active" as const, label: translate('stakingActive'), help: translate('stakingActiveHelp') },
  { key: "inactive" as const, label: translate('stakingInactive'), help: translate('stakingInactiveHelp') },
  { key: "retired" as const, label: translate('stakingRetired'), help: translate('stakingRetiredHelp') },
])
const rewards = computed(() => [
  { key: "rewardsPaid" as const, label: translate('stakingRewardsPaid') },
  { key: "rewardsRestaked" as const, label: translate('stakingRewardsRestaked') },
  { key: "fees" as const, label: translate('stakingFees') },
  { key: "rewardsLessFees" as const, label: translate('stakingRewardsLessFees') },
])
const principal = computed(() => [
  { key: "deposits" as const, label: translate('stakingDeposits') },
  { key: "withdrawals" as const, label: translate('stakingWithdrawals') },
  { key: "unclassified" as const, label: translate('stakingUnclassified') },
])
const KINDS: Record<StakingEventKind, () => string> = {
  reward_paid: () => translate('stakingKindRewardPaid'),
  reward_restaked: () => translate('stakingKindRewardRestaked'),
  deposit: () => translate('stakingKindDeposit'),
  withdrawal: () => translate('stakingKindWithdrawal'),
  fee: () => translate('stakingKindFee'),
  unclassified: () => translate('stakingKindUnclassified'),
}
const shortAddress = (address: string | null) => {
  if (!address) return "—"
  const groups = address.split(" ")
  return groups.length > 3 ? `${groups[0]} ${groups[1]} … ${groups.at(-1)}` : address
}
const showEvents = ref(false)
</script>

<template>
  <section class="border-t border-default" aria-labelledby="staking">
    <header class="flex h-12 items-center justify-between gap-3">
      <h2 id="staking" class="text-sm font-medium text-highlighted">{{ $t('staking') }}</h2>
      <span class="text-xs text-muted">{{ $t('stakingRead', { value1: timeAgo(staking.observedAt) }) }}</span>
    </header>

    <div class="flex flex-col gap-8 pt-1">
      <!-- Balances by state: already counted in the holdings, so no total that could read as extra money. -->
      <div>
        <dl class="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <div v-for="row in balances" :key="row.key" class="min-w-0">
            <dt class="text-xs text-muted">
              <UTooltip :text="row.help"><span class="underline decoration-dotted underline-offset-4">{{ row.label }}</span></UTooltip>
            </dt>
            <dd class="mt-1 text-sm font-medium break-words text-highlighted tabular-nums">{{ coins(row.key) }}</dd>
            <dd v-if="worth(row.key)" class="text-xs text-muted tabular-nums">{{ worth(row.key) }}</dd>
          </div>
        </dl>
        <p class="mt-3 text-xs text-pretty text-muted">{{ $t('stakingInHoldings') }}</p>
      </div>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span class="text-muted">{{ $t('stakingValidator') }}</span>
        <span class="font-mono text-xs text-highlighted">{{ shortAddress(staking.validator) }}</span>
        <UBadge v-if="staking.validatorListed === false" color="warning" variant="subtle" size="sm" :label="$t('stakingNotListed')" />
        <UBadge v-else-if="staking.validatorListed" color="neutral" variant="subtle" size="sm" :label="$t('stakingListed')" />
      </div>

      <div>
        <h3 class="text-sm font-medium text-highlighted">{{ $t('stakingIdentifiedRewards') }}</h3>
        <UAlert
          class="mt-3"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="$t('stakingSubsetTitle')"
          :description="staking.validatorListed === false ? `${$t('stakingSubsetBody')} ${$t('stakingNotListedBody')}` : $t('stakingSubsetBody')"
        />
        <dl class="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <div v-for="row in rewards" :key="row.key" class="min-w-0">
            <dt class="text-xs text-muted">{{ row.label }}</dt>
            <dd class="mt-1 text-sm font-medium break-words text-highlighted tabular-nums">{{ coins(row.key) }}</dd>
            <dd v-if="worth(row.key)" class="text-xs text-muted tabular-nums">{{ $t('stakingAtTodaysPrice', { value1: worth(row.key) }) }}</dd>
          </div>
        </dl>

        <table v-if="staking.monthly.length" class="mt-5 w-full text-sm">
          <caption class="sr-only">{{ $t('stakingMonthly') }}</caption>
          <thead>
            <tr class="text-xs text-muted">
              <th scope="col" class="py-2 text-start font-normal">{{ $t('month') }}</th>
              <th scope="col" class="py-2 text-end font-normal">{{ $t('stakingPaid') }}</th>
              <th scope="col" class="py-2 text-end font-normal">{{ $t('stakingRestaked') }}</th>
              <th scope="col" class="hidden py-2 text-end font-normal sm:table-cell">{{ $t('stakingValueToday') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default border-t border-default">
            <tr v-for="month in [...staking.monthly].reverse()" :key="month.month">
              <th scope="row" class="py-2.5 text-start font-normal text-highlighted">{{ formatMonth(month.month) }}</th>
              <td class="py-2.5 text-end tabular-nums">{{ formatCoins(month.paid, 5) }}</td>
              <td class="py-2.5 text-end tabular-nums">{{ formatCoins(month.restaked, 5) }}</td>
              <td class="hidden py-2.5 text-end text-muted tabular-nums sm:table-cell">{{ month.valueMinor === null ? "—" : format(month.valueMinor, currency) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="mt-4 text-sm text-muted">{{ $t('stakingNoRewards') }}</p>
      </div>

      <div>
        <h3 class="text-sm font-medium text-highlighted">{{ $t('stakingUnknownTitle') }}</h3>
        <dl class="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
          <div v-for="label in [$t('stakingUnpaid'), $t('stakingProfit'), $t('stakingApy')]" :key="label">
            <dt class="text-xs text-muted">{{ label }}</dt>
            <dd class="mt-1 text-sm font-medium text-highlighted">{{ $t('unknown') }}</dd>
          </div>
        </dl>
        <p class="mt-3 text-xs text-pretty text-muted">{{ $t('stakingUnknownBody') }}</p>
      </div>

      <div>
        <h3 class="text-sm font-medium text-highlighted">{{ $t('stakingPrincipal') }}</h3>
        <dl class="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
          <div v-for="row in principal" :key="row.key" class="min-w-0">
            <dt class="text-xs text-muted">{{ row.label }}</dt>
            <dd class="mt-1 text-sm font-medium break-words text-highlighted tabular-nums">{{ coins(row.key) }}</dd>
          </div>
        </dl>
        <p class="mt-3 text-xs text-pretty text-muted">{{ $t('stakingPrincipalBody') }}</p>
      </div>

      <div>
        <UButton
          color="neutral"
          variant="link"
          class="px-0"
          :trailing-icon="showEvents ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          :aria-expanded="showEvents"
          aria-controls="staking-events"
          :label="$t('stakingEvents', { count: formatCount(staking.eventCount) }, staking.eventCount)"
          @click="showEvents = !showEvents"
        />
        <ul v-if="showEvents" id="staking-events" class="mt-2 divide-y divide-default border-t border-default">
          <li v-for="event in staking.events" :key="event.id" class="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-sm">
            <span class="w-24 shrink-0 text-muted tabular-nums">{{ formatDate(event.at) }}</span>
            <span class="min-w-0 flex-1 basis-40">
              <span class="text-highlighted">{{ KINDS[event.kind]() }}</span>
              <span v-if="event.counterparty" class="ms-2 font-mono text-xs text-muted">{{ shortAddress(event.counterparty) }}</span>
              <span class="block text-xs text-dimmed">{{ event.id.startsWith('restake:') ? $t('stakingSourceIndex') : $t('stakingSourceChain') }}</span>
            </span>
            <span class="ms-auto tabular-nums">{{ formatCoins(event.amount, 5) }} {{ staking.symbol }}</span>
          </li>
        </ul>
        <p class="mt-2 text-xs text-muted">{{ $t('stakingCoverage', { value1: formatDate(staking.coverage.from), value2: formatDate(staking.coverage.to) }) }}</p>
      </div>
    </div>
  </section>
</template>
