<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui"

// Settings: one panel with a row of links under the title; each section is a child page.
useHead({ title: "Settings" })
const route = useRoute()
const links = computed<NavigationMenuItem[]>(() =>
  [
    { label: "Profile", icon: "i-lucide-user", to: "/settings" },
    { label: "Security", icon: "i-lucide-shield", to: "/settings/security" },
    { label: "Agents", icon: "i-lucide-bot", to: "/settings/agents" },
    { label: "Categories", icon: "i-lucide-tags", to: "/settings/categories" },
  ].map((link) => ({ ...link, active: route.path === link.to })),
)
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header>
      <PageNavbar title="Settings" :scoped="false" />
      <UDashboardToolbar :ui="{ root: 'px-2 sm:px-4' }">
        <UNavigationMenu :items="links" highlight aria-label="Settings sections" class="-mb-px" :ui="{ link: 'h-11 px-2.5', linkLeadingIcon: 'hidden sm:inline-flex' }" />
      </UDashboardToolbar>
    </template>
    <template #body>
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <NuxtPage />
        <LegalLinks class="pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]" />
      </div>
    </template>
  </UDashboardPanel>
</template>
