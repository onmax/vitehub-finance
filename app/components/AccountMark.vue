<script setup lang="ts">
// The bank, exchange, or wallet behind an account, small, for rows that name the account. Nothing while accounts load.
const props = withDefaults(defineProps<{ accountId: string; size?: "xs" | "sm" }>(), { size: "sm" })
const { data: accounts } = useAccounts()
const account = computed(() => accounts.value.find((item) => item.id === props.accountId))
</script>

<template>
  <InstitutionMark
    v-if="account"
    :provider="account.provider"
    :name="account.institution"
    :logo="account.logo"
    :icon="ACCOUNT_KINDS[account.kind].icon"
    :size="size"
  />
</template>
