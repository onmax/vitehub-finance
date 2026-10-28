<script setup lang="ts">
import UContentNavigation from "@nuxt/ui/components/content/ContentNavigation.vue"
// /docs, signed in or not: a header with the way into the app, then the page (pages/docs/[...slug].vue lays out the
// tree, the page, and its sections). On phones the tree opens from the header's menu button.
const { loggedIn } = useAuthSession()
const { data: navigation } = useDocsNavigation()
const route = useRoute()
const open = ref(false)
watch(() => route.path, () => (open.value = false))
</script>

<template>
  <div class="min-h-dvh bg-default">
    <header class="sticky top-0 z-30 border-b border-default bg-default/90 backdrop-blur">
      <div class="mx-auto flex h-14 max-w-(--ui-container) items-center gap-2 px-4 sm:px-6 lg:px-8">
        <UButton class="-ms-1.5 lg:hidden" icon="i-lucide-menu" color="neutral" variant="ghost" :aria-label="$t('menu', { value1: $t('docs') })" @click="open = true" />
        <NuxtLink to="/docs" class="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-primary">
          <AppLogo />
          <span class="hidden text-sm text-muted sm:inline">{{ $t('docs') }}</span>
        </NuxtLink>
        <div class="ms-auto flex items-center gap-1.5">
          <UColorModeButton />
          <!-- On phones the way back is its icon, so the header fits on one line. -->
          <UButton
            :to="loggedIn ? '/' : '/login'"
            :icon="loggedIn ? 'i-lucide-arrow-left' : 'i-lucide-log-in'"
            :aria-label="loggedIn ? $t('backToVitehubFinance') : $t('signIn')"
            color="neutral"
            variant="outline"
            size="sm"
          >
            <span class="hidden sm:inline">{{ loggedIn ? $t('backToVitehubFinance') : $t('signIn') }}</span>
          </UButton>
        </div>
      </div>
    </header>

    <UContainer>
      <slot />
    </UContainer>

    <USlideover v-model:open="open" side="left" :title="$t('docs')" :ui="{ content: 'max-w-xs' }">
      <template #body>
        <UContentNavigation v-if="navigation.length" :navigation="navigation" highlight />
      </template>
    </USlideover>
  </div>
</template>
