<script setup lang="ts">
// Who sees an account: Private (only its owner) or Shared (everyone in the household).
defineProps<{ visibility: "private" | "household" }>()
</script>

<template>
  <UBadge
    color="neutral"
    variant="outline"
    size="sm"
    :icon="visibility === 'private' ? 'i-lucide-lock' : 'i-lucide-users'"
    :label="visibility === 'private' ? $t('private') : $t('shared')"
  />
</template>
