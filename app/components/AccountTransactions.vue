<script setup lang="ts">
import type { TransactionPage } from "#shared/api"

// An account's latest transactions, compact, with a link to the full, filterable list.
const props = defineProps<{ accountId: string; currency: string }>()
const { data, status, error, refresh } = useScopedFetch<TransactionPage | null>("/api/transactions", {
  key: "transactions",
  unscoped: true,
  query: () => ({ account: props.accountId, limit: 12 }),
  default: () => null,
})
const { find } = useCategories()
const items = computed(() => data.value?.items ?? [])
</script>

<template>
  <section class="overflow-hidden rounded-xl border border-default bg-default shadow-xs" aria-labelledby="account-transactions">
    <header class="flex items-center justify-between gap-3 border-b border-default px-4 py-2.5 sm:px-5">
      <h2 id="account-transactions" class="text-sm font-medium text-highlighted">Transactions</h2>
      <UButton
        v-if="items.length"
        :to="`/transactions?account=${accountId}`"
        color="neutral"
        variant="ghost"
        size="sm"
        trailing-icon="i-lucide-arrow-right"
        label="See all"
        class="-mr-2"
      />
    </header>
    <div v-if="error" class="p-4 sm:p-5">
      <PageError :error="error" title="Transactions didn’t load" @retry="refresh()" />
    </div>
    <ul v-else-if="status === 'pending' && !data" class="divide-y divide-default" aria-label="Loading transactions">
      <li v-for="index in 5" :key="index" class="flex items-center gap-3 px-4 py-3 sm:px-5">
        <USkeleton class="size-8 rounded-md" />
        <div class="flex-1">
          <USkeleton class="h-4 w-40" />
          <USkeleton class="mt-1.5 h-3 w-20" />
        </div>
        <USkeleton class="h-4 w-16" />
      </li>
    </ul>
    <p v-else-if="items.length === 0" class="px-4 py-10 text-center text-sm text-muted sm:px-5">
      No transactions yet. They appear after the next sync or a CSV import.
    </p>
    <ul v-else class="divide-y divide-default">
      <li v-for="item in items" :key="item.id" class="flex min-h-14 items-center gap-3 px-4 py-2 sm:px-5" :class="item.excluded && 'opacity-60'">
        <Monogram :name="item.counterparty || item.description" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm text-highlighted" :title="item.description">{{ item.counterparty || item.description }}</p>
          <p class="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <span class="money shrink-0">{{ formatDay(item.date) }}</span>
            <template v-if="find(item.categoryId)">
              <span aria-hidden="true">·</span>
              <span class="truncate">{{ find(item.categoryId)?.name }}</span>
            </template>
            <template v-if="item.status === 'pending'">
              <span aria-hidden="true">·</span>
              <span>Pending</span>
            </template>
          </p>
        </div>
        <Money :minor="item.amountMinor" :currency="item.currency" signed tone="in" class="text-sm" :class="item.amountMinor <= 0 && 'text-highlighted'" />
      </li>
    </ul>
  </section>
</template>
