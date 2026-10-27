<script setup lang="ts">
import { en, es, fr, de, pt } from "@nuxt/ui/locale"
const { locale } = useLanguage()
const uiLocales = { en, es, fr, de, pt }
const uiLocale = computed(() => uiLocales[locale.value])
useHead({ titleTemplate: (title) => (title ? `${title} · ViteHub Finance` : "ViteHub Finance") })
</script>

<template>
  <UApp :locale="uiLocale" :toaster="{ position: 'bottom-right' }" :tooltip="{ delayDuration: 300 }">
    <NuxtLoadingIndicator color="var(--ui-primary)" :height="2" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
