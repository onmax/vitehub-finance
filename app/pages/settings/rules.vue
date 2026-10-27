<script setup lang="ts">
// Rules that file and exclude transactions, and the ones the household's transactions suggest.
useHead({ get title() { return translate('rules') } })
</script>

<template>
  <SettingsRuleSuggestions />
  <SettingsRules />
</template>
