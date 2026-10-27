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
  <section class="border-t border-default" aria-labelledby="account-transactions">
    <header class="flex h-12 items-center justify-between gap-3">
      <h2 id="account-transactions" class="text-sm font-medium text-highlighted">{{ $t('transactions') }}</h2>
      <UButton
        v-if="items.length"
        :to="`/transactions?account=${accountId}`"
        color="neutral"
        variant="link"
        size="sm"
        trailing-icon="i-lucide-arrow-right"
        :label="$t('seeAll')"
        class="-me-1.5 text-muted"
      />
    </header>
    <div v-if="error" class="py-4">
      <PageError :error="error" :title="$t('transactionsDidnTLoad')" @retry="refresh()" />
    </div>
    <ul v-else-if="status === 'pending' && !data" class="divide-y divide-default" :aria-label="$t('loadingTransactions')">
      <li v-for="index in 5" :key="index" class="flex items-center gap-3 py-3">
        <USkeleton class="size-8 rounded-md" />
        <div class="flex-1">
          <USkeleton class="h-4 w-40" />
          <USkeleton class="mt-1.5 h-3 w-20" />
        </div>
        <USkeleton class="h-4 w-16" />
      </li>
    </ul>
    <p v-else-if="items.length === 0" class="py-10 text-center text-sm text-muted"> {{ $t('noTransactionsYetTheyAppearAfterTheNextSyncOr') }} </p>
    <ul v-else class="divide-y divide-default">
      <li v-for="item in items" :key="item.id" class="flex min-h-14 items-center gap-3 py-2" :class="item.excluded && 'opacity-60'">
        <Monogram :name="item.counterparty || item.description" />
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-1.5 text-sm text-highlighted">
            <span class="truncate" :title="item.description">{{ item.counterparty || item.description }}</span>
            <UIcon v-if="item.hidden" name="i-lucide-lock" class="size-3.5 shrink-0 text-dimmed" :aria-label="$t('onlyYouSeeThis')" />
          </p>
          <p class="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <span class="money shrink-0">{{ formatDay(item.date) }}</span>
            <template v-if="find(item.categoryId)">
              <span aria-hidden="true">·</span>
              <span class="truncate">{{ find(item.categoryId)?.name }}</span>
            </template>
            <template v-if="item.status === 'pending'">
              <span aria-hidden="true">·</span>
              <span>{{ $t('pending') }}</span>
            </template>
          </p>
        </div>
        <Money :minor="item.amountMinor" :currency="item.currency" signed tone="in" original="below" class="text-sm" :class="item.amountMinor <= 0 && 'text-highlighted'" />
      </li>
    </ul>
  </section>
</template>
