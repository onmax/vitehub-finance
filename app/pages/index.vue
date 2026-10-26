<script setup lang="ts">
const { data } = await useFetch("/api/me")
</script>

<template>
  <pre>{{ data }}</pre>
</template>
