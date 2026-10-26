<script setup lang="ts">
// The demo's one-line notice above the app, with a switch to the other person: visitors see what each of them sees,
// including that a private account stays with its owner.
const { data: me } = useMe()
const route = useRoute()
const notify = useNotify()
const pending = ref(false)

const isPablo = computed(() => me.value?.user.email === "pablo@demo.vitehub.dev")

async function switchPerson() {
  pending.value = true
  try {
    await $fetch("/api/demo/session", { method: "POST", body: { as: isPablo.value ? "lucia" : "pablo" } })
    // A fresh load drops everything cached for the previous person. Their account pages may not exist for the other.
    window.location.assign(route.path.startsWith("/accounts/") ? "/accounts" : route.fullPath)
  } catch (error) {
    notify.error(error, "Couldn’t switch")
    pending.value = false
  }
}
</script>

<template>
  <div
    role="region"
    aria-label="Demo"
    class="flex h-[calc(2.25rem+env(safe-area-inset-top))] items-center justify-center gap-x-3 border-b border-default bg-elevated/60 px-[max(1rem,env(safe-area-inset-left))] pt-[env(safe-area-inset-top)] text-xs text-muted sm:text-sm"
  >
    <UIcon name="i-lucide-flask-conical" class="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
    <p class="min-w-0 truncate">
      <span class="font-medium text-highlighted">Demo household.</span>
      <span class="hidden sm:inline"> Changes reset every night.</span>
      <span class="sm:hidden"> Resets nightly.</span>
    </p>
    <UButton
      v-if="me"
      size="xs"
      color="neutral"
      variant="outline"
      icon="i-lucide-repeat"
      :label="isPablo ? 'View as Lucía' : 'View as Pablo'"
      :loading="pending"
      class="shrink-0"
      @click="switchPerson"
    />
  </div>
</template>
