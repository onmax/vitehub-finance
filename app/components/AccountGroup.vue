<script setup lang="ts">
import type { AccountSummary } from "#shared/api"

// A kind of account (Cash, Credit and loans…) as a card: its name and total, then its accounts.
const props = defineProps<{ label: string; accounts: AccountSummary[] }>()
const total = computed(() => props.accounts.reduce((sum, account) => sum + (account.archived ? 0 : account.balanceBaseMinor), 0))
const headingId = useId()
</script>

<template>
  <section class="overflow-hidden rounded-xl border border-default bg-default shadow-xs" :aria-labelledby="headingId">
    <header class="flex items-baseline justify-between gap-3 border-b border-default bg-muted/50 px-4 py-2.5 sm:px-5">
      <h2 :id="headingId" class="text-sm font-medium text-highlighted">
        {{ label }} <span class="money ml-1 font-normal text-muted">{{ accounts.length }}</span>
      </h2>
      <Money :minor="total" class="text-sm font-medium text-highlighted" />
    </header>
    <ul class="divide-y divide-default">
      <li v-for="account in accounts" :key="account.id">
        <AccountRow :account="account" />
      </li>
    </ul>
  </section>
</template>
