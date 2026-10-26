<script setup lang="ts">
// The household: its people, invitations, and settings, with the privacy model in two sentences.
useHead({ title: "Household" })
const route = useRoute()
const inviting = computed(() => route.query.invite === "1")
watch(
  inviting,
  async (value) => {
    if (!value) return
    await nextTick()
    document.getElementById("invite")?.scrollIntoView({ block: "start" })
  },
  { immediate: true, flush: "post" },
)
</script>

<template>
  <UDashboardPanel id="household">
    <template #header>
      <PageNavbar title="Household" :scoped="false" />
    </template>
    <template #body>
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div class="flex gap-3 rounded-xl border border-default bg-muted p-4">
          <UIcon name="i-lucide-shield-check" class="mt-0.5 size-5 shrink-0 text-toned" />
          <p class="text-sm text-toned">
            Shared accounts are visible to everyone in the household, with their transactions. Private accounts are visible only
            to their owner and stay out of everyone else’s totals.
          </p>
        </div>
        <HouseholdMembers />
        <HouseholdInvite :open="inviting" />
        <HouseholdSettingsForm />
      </div>
    </template>
  </UDashboardPanel>
</template>
