<script setup lang="ts">
import type { Overview } from "#shared/api"

const props = defineProps<{ overview: Overview }>()
const { format } = useMoney()
const points = computed(() => props.overview.netWorthSeries.map((point) => ({ date: point.date, value: point.valueMinor })))
// Where the money is: each kind of account's share of net worth, or each account's when they're all one kind.
const { data: accounts } = useAccounts()
const parts = computed(() => {
  const counted = accounts.value.filter((account) => account.includeInNetWorth && !account.archived)
  const totals = new Map<string, { label: string; value: number }>()
  const byGroup = new Set(counted.map((account) => ACCOUNT_KINDS[account.kind].group)).size > 1
  for (const account of counted) {
    const group = ACCOUNT_KINDS[account.kind].group
    const key = byGroup ? group : account.id
    const label = byGroup ? ACCOUNT_GROUPS.find((item) => item.id === group)!.label : account.name
    totals.set(key, { label, value: (totals.get(key)?.value ?? 0) + account.balanceBaseMinor })
  }
  const list = [...totals].map(([id, part]) => ({ id, ...part })).sort((a, b) => b.value - a.value)
  const shown = list.slice(0, 4)
  const rest = list.slice(4).reduce((sum, part) => sum + part.value, 0)
  if (list.length > 4) shown.push({ id: "rest", get label() { return translate('other') }, value: rest })
  const positive = shown.reduce((sum, part) => sum + Math.max(0, part.value), 0)
  return shown.map((part, index) => ({
    ...part,
    share: positive ? Math.max(0, part.value) / positive : 0,
    color: `var(--color-chart-${(index % 5) + 1})`,
  }))
})
const axis = (value: number) => format(Math.round(value), props.overview.currency, { compact: true })
</script>

<template>
  <SectionCard :title="$t('overviewBalanceHistory')" to="/accounts" :link-label="$t('accounts')">
    <AreaChart
      v-if="points.length >= 2"
      :points="points"
      :format="axis"
      :label="$t('netWorthLast90Days')"
      :height="200"
    />
    <p v-else class="py-10 text-center text-sm text-muted">{{ $t('balancesUpdateEveryDayTheChartFillsInFromTomorrow') }}</p>
    <div v-if="parts.length > 1" class="mt-auto pt-5">
      <div class="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        <span v-for="group in parts.filter((item) => item.share > 0)" :key="group.id" class="h-full" :style="{ width: `${group.share * 100}%`, background: group.color }" />
      </div>
      <ul class="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm" :aria-label="$t('whatNetWorthIsMadeOf')">
        <li v-for="group in parts" :key="group.id" class="flex items-center gap-1.5">
          <span class="size-2 rounded-xs" :style="{ background: group.color }" aria-hidden="true" />
          <span class="text-muted">{{ group.label }}</span>
          <span class="money text-highlighted">{{ format(group.value, overview.currency, { compact: true }) }}</span>
        </li>
      </ul>
    </div>
  </SectionCard>
</template>
