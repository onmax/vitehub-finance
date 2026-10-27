<script setup lang="ts">
// The frame of /privacy and /terms: a readable column in the auth layout, with links to the other page and back.
defineProps<{ title: string; updated: string }>()
const { loggedIn } = useAuthSession()
</script>

<template>
  <article
    class="[&_a]:font-medium [&_a]:text-highlighted [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-7 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-highlighted [&_li]:mt-1.5 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:ps-5 text-sm/6 text-toned"
  >
    <h1 class="text-xl font-semibold text-highlighted">{{ title }}</h1>
    <p class="text-muted">{{ $t('lastUpdated', { value1: updated }) }}</p>
    <slot />
  </article>
  <nav class="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted" :aria-label="$t('legal')">
    <ULink to="/privacy" class="underline-offset-4 hover:underline" active-class="text-highlighted">{{ $t('privacy') }}</ULink>
    <ULink to="/terms" class="underline-offset-4 hover:underline" active-class="text-highlighted">{{ $t('terms') }}</ULink>
    <ULink :to="loggedIn ? '/' : '/login'" class="underline-offset-4 hover:underline">{{ loggedIn ? $t('backToVitehubFinance') : $t('signIn') }}</ULink>
  </nav>
</template>
