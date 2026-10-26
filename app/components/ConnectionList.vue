<script setup lang="ts">
import type { ConnectionSummary } from "#shared/api"

// Every connection the caller can see: theirs, and others' that feed an account shared with the household.
defineProps<{ connections: ConnectionSummary[]; loading?: boolean; highlight?: string | null }>()
defineEmits<{ changed: [] }>()
</script>

<template>
  <div>
    <ul v-if="loading && connections.length === 0" class="divide-y divide-default" aria-busy="true">
      <li v-for="row in 2" :key="row" class="flex items-center gap-3 py-3">
        <USkeleton class="size-9 rounded-lg" />
        <div class="flex flex-1 flex-col gap-1.5"><USkeleton class="h-4 w-40" /><USkeleton class="h-3 w-64" /></div>
        <USkeleton class="h-8 w-24" />
      </li>
    </ul>
    <ul v-else class="divide-y divide-default">
      <ConnectionRow
        v-for="connection in connections"
        :key="connection.id"
        :connection="connection"
        :highlighted="highlight === connection.id"
        @changed="$emit('changed')"
      />
    </ul>
  </div>
</template>
