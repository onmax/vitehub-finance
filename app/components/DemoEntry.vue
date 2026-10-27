<script setup lang="ts">
// A public instance's way into the demo household, on sign-in and sign-up: the server seeds it if it's missing and
// signs in as Lucía. Real accounts sit next to it; this one resets every night.
const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ pending: [value: boolean] }>()
const session = useAuthSession()
const pending = ref(false)
const error = ref("")

async function explore() {
  pending.value = true
  emit("pending", true)
  error.value = ""
  try {
    await $fetch("/api/demo/session", { method: "POST", body: { as: "lucia" } })
    await session.refresh()
    await navigateTo("/")
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTOpenTheDemoTryAgain'))
  } finally {
    pending.value = false
    emit("pending", false)
  }
}
</script>

<template>
  <section class="rounded-lg border border-default p-4" :aria-label="$t('exploreTheDemo')">
    <p class="text-sm font-medium text-highlighted">{{ $t('justLooking') }}</p>
    <p class="mt-0.5 text-sm text-pretty text-muted">{{ $t('aFictionalHouseholdInMadridItsDataResetsEveryNight') }}</p>
    <UButton
      class="mt-3"
      block
      color="neutral"
      variant="outline"
      icon="i-lucide-arrow-right"
      trailing
      :label="$t('exploreTheDemo')"
      :loading="pending"
      :disabled="props.disabled && !pending"
      @click="explore"
    />
    <p v-if="error" class="mt-2 text-sm text-error" role="alert">{{ error }}</p>
  </section>
</template>
