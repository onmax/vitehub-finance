<script setup lang="ts">
// An amount in tabular figures, in the person's display currency. When that isn't the amount's own currency, the
// original follows: in brackets inside a sentence (`inline`), or on a smaller line under it in lists and tables
// (`below`, aligned to `align`), the way Base's activity list shows a coin under its dollar value. `tone="in"` colors
// positive amounts as money coming in; out stays the default text. The color sits on an inner span so a text color
// passed from outside (text-highlighted) can't override it.
const props = withDefaults(
  defineProps<{
    minor: number
    currency?: string | null
    signed?: boolean
    compact?: boolean
    tone?: "in" | "none"
    original?: "inline" | "below" | "none"
    align?: "start" | "end"
  }>(),
  { tone: "none", original: "inline", align: "end" },
)
const { format, formatOriginal, converts } = useMoney()
const options = computed(() => ({ signed: props.signed, compact: props.compact }))
const text = computed(() => format(props.minor, props.currency, options.value))
const originalText = computed(() => (props.original !== "none" && converts(props.currency) ? formatOriginal(props.minor, props.currency, options.value) : null))
</script>

<template>
  <span v-if="originalText && original === 'below'" class="money inline-flex flex-col" :class="align === 'end' ? 'items-end text-end' : 'items-start text-start'">
    <span><span v-if="tone === 'in' && minor > 0" class="money-in">{{ text }}</span><template v-else>{{ text }}</template></span>
    <span class="text-xs font-normal tracking-normal text-muted">{{ originalText }}</span>
  </span>
  <span v-else class="money"><span v-if="tone === 'in' && minor > 0" class="money-in">{{ text }}</span><template v-else>{{ text }}</template><span v-if="originalText" class="ms-1 text-[0.85em] font-normal tracking-normal text-muted">({{ originalText }})</span></span>
</template>
