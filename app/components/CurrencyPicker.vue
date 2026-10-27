<script setup lang="ts">
import { CURRENCIES, isCurrency } from "#shared/money"

// The currency this person sees amounts in. The first option follows the household's, so changing that carries over.
const { chosen, household, select, pending } = useDisplayCurrency()
const FOLLOW = "household"
const items = computed(() => [
  { value: FOLLOW, label: translate('householdCurrencyOption', { currency: household.value }) },
  ...CURRENCIES.filter((code) => code !== household.value).map((code) => ({ value: code, label: code })),
])
const change = (value: string) => void select(isCurrency(value) ? value : null)
</script>

<template>
  <USelect :model-value="chosen ?? FOLLOW" :items="items" :aria-label="$t('currency')" :loading="pending" :disabled="pending" class="w-52" @update:model-value="change" />
</template>
