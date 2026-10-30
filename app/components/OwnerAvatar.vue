<script setup lang="ts">
// Whose account or transaction it is, as a small avatar with their name in a tooltip.
const props = withDefaults(defineProps<{ name: string; userId?: string; size?: "3xs" | "2xs" | "xs" | "sm" }>(), { size: "2xs" })
const { data: me } = useMe()
const image = computed(() => me.value?.members.find((person) => person.userId === props.userId)?.image ?? undefined)
const label = computed(() => (props.userId && props.userId === me.value?.user.id ? translate('nameYou', { name: props.name }) : props.name))
</script>

<template>
  <UTooltip :text="label">
    <UAvatar :alt="name" :src="image" :size="size" :aria-label="label" />
  </UTooltip>
</template>
