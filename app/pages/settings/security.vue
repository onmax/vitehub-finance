<script setup lang="ts">
useHead({ get title() { return translate('security') } })
</script>

<template>
  <SettingsPasskeys />
  <SettingsTwoFactor />
  <SettingsPassword />
  <SettingsSessions />
  <SettingsDeleteAccount />
</template>
