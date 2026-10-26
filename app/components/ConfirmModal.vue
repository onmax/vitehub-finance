<script setup lang="ts">
// Opened through useConfirm(): closes with `{ confirmed, checked }`.
const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    confirmLabel?: string
    destructive?: boolean
    checkbox?: { label: string; description?: string; default?: boolean }
  }>(),
  { confirmLabel: "Confirm", destructive: false },
)
const emit = defineEmits<{ close: [result: { confirmed: boolean; checked: boolean }] }>()
const checked = ref(props.checkbox?.default ?? false)
const done = (confirmed: boolean) => emit("close", { confirmed, checked: checked.value })
</script>

<template>
  <UModal
    :title="title"
    :description="description"
    :ui="{ content: 'max-w-md', footer: 'justify-end' }"
    @update:open="(value) => !value && done(false)"
  >
    <template v-if="checkbox" #body>
      <UCheckbox v-model="checked" :label="checkbox.label" :description="checkbox.description" />
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" label="Cancel" @click="done(false)" />
      <UButton autofocus :color="destructive ? 'error' : 'primary'" :label="confirmLabel" @click="done(true)" />
    </template>
  </UModal>
</template>
