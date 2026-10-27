<script setup lang="ts">
// Wraps a control the demo locks (the server refuses it with a 403 anyway). Outside the demo it renders the control
// untouched; in the demo the slot gets `locked` to disable it, and a tooltip says why. A disabled button gets no pointer
// or focus events, so the wrapper is the tooltip's trigger and is focusable itself; the reason is also read out.
// Classes given to DemoLock style the wrapper (its place in a flex layout) and only apply in the demo; outside it the
// control is rendered as is, so give the control its own layout classes too.
defineOptions({ inheritAttrs: false })
const props = defineProps<{ block?: boolean }>()
defineSlots<{ default(props: { locked: boolean }): unknown }>()
const demo = useDemoPerson()
</script>

<template>
  <slot v-if="!demo" :locked="false" />
  <UTooltip v-else :text="demoLocked()">
    <span v-bind="$attrs" tabindex="0" class="rounded-md focus-visible:outline-2 focus-visible:outline-primary" :class="props.block ? 'flex w-full' : 'inline-flex'">
      <slot :locked="true" />
      <span class="sr-only">{{ demoLocked() }}</span>
    </span>
  </UTooltip>
</template>
