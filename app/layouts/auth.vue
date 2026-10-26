<script setup lang="ts">
// Signed-out pages: sign in, sign up, invitations, the agent consent. Pages that set `wide` in their page meta (the
// legal pages) get a reading width instead of the form's. Flat: the form sits on the page, no card.
const route = useRoute()
const wide = computed(() => route.meta.wide === true)
</script>

<template>
  <main class="grid min-h-dvh place-items-center bg-default px-4 py-12 pb-[max(3rem,env(safe-area-inset-bottom))]">
    <div class="w-full" :class="wide ? 'max-w-2xl' : 'max-w-sm'">
      <NuxtLink to="/" class="mb-8 flex justify-center rounded-md focus-visible:outline-2 focus-visible:outline-primary" aria-label="ViteHub Finance">
        <AppLogo />
      </NuxtLink>
      <slot />
    </div>
  </main>
</template>
