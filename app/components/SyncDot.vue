<script setup lang="ts">
import type { ConnectionStatus } from "#shared/api"

// A connection's state as a dot with its words beside it, or in a tooltip when `compact`.
const props = defineProps<{ status: ConnectionStatus | null; compact?: boolean }>()
const meta = computed(() => (props.status ? CONNECTION_STATUS[props.status] : { label: "Manual", color: "neutral" as const }))
const dot = computed(
  () =>
    ({
      success: "bg-success",
      warning: "bg-warning",
      error: "bg-error",
      neutral: "bg-(--ui-text-dimmed)",
    })[meta.value.color],
)
</script>

<template>
  <UTooltip v-if="compact" :text="meta.label">
    <span class="inline-flex size-4 items-center justify-center" :aria-label="meta.label" role="img">
      <span class="size-2 rounded-full" :class="dot" />
    </span>
  </UTooltip>
  <span v-else class="inline-flex items-center gap-1.5 text-xs text-muted">
    <span class="size-2 shrink-0 rounded-full" :class="dot" aria-hidden="true" />
    {{ meta.label }}
  </span>
</template>
