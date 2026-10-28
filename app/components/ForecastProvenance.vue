<script setup lang="ts">
import type { PlanningForecast } from '#shared/planning'
defineProps<{ forecast: PlanningForecast }>()
const stale = (date: string | null) => !date || Date.now() - Date.parse(date) > 48 * 60 * 60 * 1000
</script>

<template>
  <SectionCard :title="$t('planningAssumptions')" body-class="gap-4">
    <p class="text-sm text-muted">{{ $t('planningRangeHelp') }}</p>
    <p class="text-sm text-muted">{{ $t('planningHistoryHelp') }}</p>
    <p class="text-sm text-muted">{{ $t('planningSpendingHelp') }}</p>
    <p v-if="forecast.planning.budgetMonthlyMinor !== null" class="text-sm text-muted">{{ $t('planningCurrentBudgetHelp') }}</p>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <caption class="sr-only">{{ $t('planningIncludedAccounts') }}</caption>
        <thead><tr class="border-b border-default text-left text-xs text-muted"><th scope="col" class="py-2 pe-4">{{ $t('account') }}</th><th scope="col" class="pe-4">{{ $t('planningBalanceAsOf') }}</th><th scope="col" class="pe-4">{{ $t('planningLastSync') }}</th><th scope="col">{{ $t('planningExchangeRate') }}</th></tr></thead>
        <tbody class="divide-y divide-default"><tr v-for="account in forecast.planning.accounts" :key="account.id">
          <th scope="row" class="py-3 pe-4 text-left font-medium text-highlighted">{{ account.name }} <span class="text-xs text-muted">{{ account.currency }}</span></th>
          <td class="pe-4" :class="stale(account.balanceUpdatedAt) ? 'text-warning' : 'text-muted'">{{ account.balanceUpdatedAt ? formatDate(account.balanceUpdatedAt.slice(0, 10)) : $t('planningUnknown') }}<span v-if="stale(account.balanceUpdatedAt)" class="block text-xs">{{ $t('planningCheckBalance') }}</span></td>
          <td class="pe-4 text-muted">{{ account.syncAt ? formatDate(account.syncAt.slice(0, 10)) : $t('planningUnknown') }}</td>
          <td :class="account.fx === 'missing' || account.fx === 'stale' ? 'text-warning' : 'text-muted'">{{ $t(`planningFx${account.fx}`) }}</td>
        </tr></tbody>
      </table>
    </div>
    <p v-if="forecast.planning.fxAt" class="text-xs text-muted">{{ $t('planningFxAsOf', { date: formatDate(forecast.planning.fxAt.slice(0, 10)) }) }}</p>
    <p v-if="forecast.planning.protectedGoals.length" class="text-sm text-muted">{{ $t('planningProtectedGoals') }} {{ forecast.planning.protectedGoals.map(goal => goal.name).join(', ') }}</p>
  </SectionCard>
</template>
