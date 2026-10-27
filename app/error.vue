<script setup lang="ts">
import type { NuxtError } from "#app"

// The 404 page, and the last resort for anything else that breaks a whole page.
const props = defineProps<{ error: NuxtError }>()
const notFound = computed(() => props.error.statusCode === 404)
useHead({ title: notFound.value ? translate('pageNotFound') : translate('somethingWentWrong') })
const home = () => clearError({ redirect: "/" })
</script>

<template>
  <UApp>
    <main class="grid min-h-dvh place-items-center bg-default px-6 py-12">
      <div class="flex max-w-sm flex-col items-center text-center">
        <AppLogo mark-only />
        <p class="money mt-8 text-sm font-medium text-muted">{{ error.statusCode }}</p>
        <h1 class="mt-2 text-2xl font-semibold text-highlighted">{{ notFound ? $t('thisPageDoesnTExist') : $t('somethingWentWrong') }}</h1>
        <p class="mt-2 text-sm text-muted">
          {{ notFound ? $t('theLinkMayBeOldOrTheAccountItPointed') : $t('reloadThePageIfItKeepsHappeningTheServerMay') }}
        </p>
        <div class="mt-6 flex gap-2">
          <UButton :label="$t('goToTheOverview')" @click="home" />
          <UButton v-if="!notFound" color="neutral" variant="outline" :label="$t('reload')" @click="() => reloadNuxtApp()" />
        </div>
      </div>
    </main>
  </UApp>
</template>
