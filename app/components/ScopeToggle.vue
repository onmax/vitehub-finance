<script setup lang="ts">
// Me / Household, in every page's navbar. Hidden while the household has one person.
const scope = useScope()
const shared = useShared()
const options = [
  { value: "me" as const, label: "Me", icon: "i-lucide-user" },
  { value: "household" as const, label: "Household", icon: "i-lucide-users" },
]
</script>

<template>
  <SegmentedControl v-if="shared" v-model="scope" :options="options" label="Whose money to show" size="sm" />
</template>
