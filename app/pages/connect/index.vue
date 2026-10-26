<script setup lang="ts">
// /connect was one page; it's two now. Old links (and bookmarks) land on the page their anchor belongs to, with the
// query intact: the bank's redirect used to bring `?linked=` and `?error=` here.
definePageMeta({
  middleware: (to) => {
    const crypto = ["#exchange", "#wallet", "#broker"].includes(to.hash)
    return navigateTo({ path: crypto ? "/connect/crypto" : "/connect/banks", query: to.query, hash: to.hash }, { replace: true })
  },
})
</script>

<template>
  <div />
</template>
