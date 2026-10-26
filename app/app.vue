<script setup lang="ts">
useHead({ titleTemplate: (title) => (title ? `${title} · Joxi` : "Joxi") })
</script>

<template>
  <UApp :toaster="{ position: 'bottom-right' }" :tooltip="{ delayDuration: 300 }">
    <NuxtLoadingIndicator color="var(--ui-primary)" :height="2" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
