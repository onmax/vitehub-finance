<script setup lang="ts">
import { LOCALES, LOCALE_NAMES, isLocale } from "#shared/locale"

const { locale, select, pending } = useLanguage()
const items = LOCALES.map((value) => ({ value, label: LOCALE_NAMES[value] }))
const change = (value: string) => { if (isLocale(value)) void select(value) }
</script>

<template>
  <USelect :model-value="locale" :items="items" :aria-label="$t('language')" :loading="pending" :disabled="pending" class="w-44" @update:model-value="change" />
</template>
