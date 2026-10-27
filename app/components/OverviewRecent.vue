<script setup lang="ts">
import type { Overview } from "#shared/api"

// The latest transactions across the accounts in view, Mercury-style rows.
defineProps<{ overview: Overview }>()
const { find } = useCategories()
const shared = useShared()
</script>

<template>
  <SectionCard :title="$t('recentTransactions')" to="/transactions">
    <p v-if="overview.recent.length === 0" class="py-6 text-center text-sm text-muted">{{ $t('noTransactionsYet') }}</p>
    <ul v-else class="flex flex-col divide-y divide-default">
      <li v-for="item in overview.recent" :key="item.id" class="flex min-h-12 items-center gap-3 py-2">
        <Monogram :name="item.counterparty || item.description" />
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5 text-sm text-highlighted">
            <span class="truncate" :title="item.description">{{ item.counterparty || item.description }}</span>
            <UIcon v-if="item.hidden" name="i-lucide-lock" class="size-3.5 shrink-0 text-dimmed" :aria-label="$t('onlyYouSeeThis')" />
          </span>
          <span class="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <span class="money shrink-0">{{ formatDay(item.date) }}</span>
            <span aria-hidden="true">·</span>
            <span class="flex min-w-0 items-center gap-1">
              <span class="size-1.5 shrink-0 rounded-full" :class="categoryColor(find(item.categoryId)?.color).solid" aria-hidden="true" />
              <span class="truncate">{{ find(item.categoryId)?.name ?? $t('uncategorized') }}</span>
            </span>
            <span aria-hidden="true" class="hidden sm:inline">·</span>
            <span class="hidden min-w-0 items-center gap-1.5 sm:flex">
              <AccountMark :account-id="item.accountId" size="xs" />
              <span class="truncate">{{ item.accountName }}</span>
            </span>
          </span>
        </span>
        <OwnerAvatar v-if="shared" :name="item.ownerName" :user-id="item.ownerId" size="2xs" class="hidden sm:inline-flex" />
        <Money :minor="item.amountMinor" :currency="item.currency" tone="in" class="text-sm text-highlighted" />
      </li>
    </ul>
  </SectionCard>
</template>
