<script setup lang="ts">
// A page's top bar: its title, the Me / Household toggle, and the page's own actions on the right.
withDefaults(defineProps<{ title: string; scoped?: boolean }>(), { scoped: true })
</script>

<template>
  <UDashboardNavbar :title="title" :ui="{ right: 'gap-2', title: 'text-sm font-semibold text-highlighted' }">
    <template #leading>
      <UDashboardSidebarCollapse class="hidden lg:inline-flex" aria-label="Toggle sidebar" />
      <slot name="leading" />
    </template>
    <template #right>
      <ScopeToggle v-if="scoped" />
      <slot name="right" />
    </template>
  </UDashboardNavbar>
</template>
