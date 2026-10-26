<script setup lang="ts">
// Where a view's data failed to load: what happened, in the server's words, and a retry. The failure goes to the
// server's logs too (app/utils/client-errors.ts).
const props = defineProps<{ error: unknown; title?: string }>()
defineEmits<{ retry: [] }>()
watch(
  () => props.error,
  (error) => error && reportClientError("load", error, { title: props.title ?? "This didn’t load" }),
  { immediate: true },
)
</script>

<template>
  <UAlert
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :title="title ?? 'This didn’t load'"
    :description="errorText(error, 'The server didn’t answer. Try again in a moment.')"
    :actions="[{ label: 'Try again', color: 'error', variant: 'outline', size: 'sm', onClick: () => $emit('retry') }]"
  />
</template>
