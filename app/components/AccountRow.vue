<script setup lang="ts">
import type { AccountSummary } from "#shared/api"

// One account in the /accounts list: kind icon, name and institution, whose it is and who sees it, sync state, when
// its balance last changed, and the balance.
const props = defineProps<{ account: AccountSummary }>()
const shared = useShared()
const kind = computed(() => ACCOUNT_KINDS[props.account.kind])
const { currency } = useMoney()
/** Shown in the household's currency too when it's kept in another. */
const foreign = computed(() => props.account.currency !== currency.value)
</script>

<template>
  <NuxtLink
    :to="`/accounts/${account.id}`"
    class="group -mx-2 my-px flex min-h-14 items-center gap-3 rounded-md px-2 py-2.5 transition-colors duration-150 hover:bg-elevated/60 focus-visible:bg-elevated/60 focus-visible:outline-2 focus-visible:outline-primary"
  >
    <InstitutionMark :provider="account.provider" :name="account.institution" :logo="account.logo" :icon="kind.icon" />
    <span class="min-w-0 flex-1">
      <span class="flex min-w-0 items-center gap-2">
        <span class="truncate text-sm font-medium text-highlighted" :title="account.name">{{ account.name }}</span>
        <UBadge v-if="account.archived" color="neutral" variant="soft" size="sm" :label="$t('archived')" />
        <UBadge v-else-if="!account.includeInNetWorth" color="neutral" variant="soft" size="sm" :label="$t('notInNetWorth')" class="hidden sm:inline-flex" />
      </span>
      <span class="flex min-w-0 items-center gap-1.5 text-xs text-muted">
        <span class="truncate">{{ account.institution ?? kind.label }}</span>
        <span aria-hidden="true" class="hidden sm:inline">·</span>
        <span class="hidden shrink-0 whitespace-nowrap sm:inline">{{ $t('updated', { value1: timeAgo(account.balanceUpdatedAt) }) }}</span>
      </span>
    </span>
    <span class="hidden shrink-0 items-center gap-2 sm:flex">
      <OwnerAvatar v-if="shared" :name="account.ownerName" :user-id="account.ownerId" />
      <VisibilityBadge :visibility="account.visibility" />
      <SyncDot :status="account.connectionStatus" compact />
    </span>
    <span class="flex shrink-0 flex-col items-end sm:min-w-28">
      <Money :minor="account.balanceMinor" :currency="account.currency" class="text-sm font-medium text-highlighted" />
      <Money v-if="foreign" :minor="account.balanceBaseMinor" class="text-xs text-muted" />
      <span class="mt-0.5 flex items-center gap-1.5 sm:hidden">
        <VisibilityBadge :visibility="account.visibility" />
      </span>
    </span>
  </NuxtLink>
</template>
