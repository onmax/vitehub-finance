<script setup lang="ts">
// An amount in tabular figures. `tone="in"` colors positive amounts as money coming in; out stays the default text.
// The color sits on an inner span so a text color passed from outside (text-highlighted) can't override it.
const props = withDefaults(
  defineProps<{
    minor: number
    currency?: string | null
    signed?: boolean
    compact?: boolean
    tone?: "in" | "none"
  }>(),
  { tone: "none" },
)
const { format } = useMoney()
const text = computed(() => format(props.minor, props.currency, { signed: props.signed, compact: props.compact }))
</script>

<template>
  <span class="money"><span v-if="tone === 'in' && minor > 0" class="money-in">{{ text }}</span><template v-else>{{ text }}</template></span>
</template>
