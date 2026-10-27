<script setup lang="ts">
import type { Overview } from "#shared/api"

// This month's money in and out next to last month's, and what's left: Mercury's net cash flow.
const props = defineProps<{ overview: Overview }>()
const { format } = useMoney()
const month = computed(() => props.overview.month)
const net = computed(() => month.value.inMinor - month.value.outMinor)

function delta(now: number, before: number) {
  if (!before) return null
  return (now - before) / before
}
const rows = computed(() => [
  { get label() { return translate('moneyIn') }, value: month.value.inMinor, before: month.value.previousInMinor, tone: "in" as const },
  { get label() { return translate('moneyOut') }, value: month.value.outMinor, before: month.value.previousOutMinor, tone: "none" as const },
])
const share = (value: number) => {
  const max = Math.max(month.value.inMinor, month.value.outMinor, 1)
  return `${Math.max(2, (value / max) * 100)}%`
}
</script>

<template>
  <SectionCard :title="formatMonth(month.month)" to="/transactions" :link-label="$t('transactions')">
    <dl class="flex flex-col gap-5">
      <div v-for="row in rows" :key="row.label">
        <div class="flex items-baseline justify-between gap-3">
          <dt class="text-sm text-muted">{{ row.label }}</dt>
          <dd class="money text-lg font-semibold" :class="row.tone === 'in' && row.value > 0 ? 'money-in' : 'text-highlighted'">
            {{ format(row.value, overview.currency) }}
          </dd>
        </div>
        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated" aria-hidden="true">
          <div class="h-full rounded-full" :class="row.tone === 'in' ? 'bg-(--color-money-in)' : 'bg-(--chart-line)'" :style="{ width: share(row.value) }" />
        </div>
        <p class="mt-1.5 text-xs text-muted">
          <template v-if="delta(row.value, row.before) !== null">
            <span class="money">{{ formatPercent(delta(row.value, row.before), { signed: true }) }}</span> {{ $t('vsLastMonth') }}<span class="money">{{ format(row.before, overview.currency, { compact: true }) }}</span>)
          </template>
          <template v-else>{{ $t('nothingLastMonthToCompareWith') }}</template>
        </p>
      </div>
      <div class="flex items-baseline justify-between gap-3 border-t border-default pt-4">
        <dt class="text-sm text-muted">{{ $t('netThisMonth') }}</dt>
        <dd class="money text-lg font-semibold" :class="net > 0 ? 'money-in' : 'text-highlighted'">
          {{ format(net, overview.currency, { signed: true }) }}
        </dd>
      </div>
    </dl>
  </SectionCard>
</template>
