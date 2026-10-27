<script setup lang="ts">
// /connect was one page; it's three now. Old links (and bookmarks) land on the page their anchor belongs to, with the
// query and hash intact: the bank's redirect used to bring `?linked=` and `?error=` here.
definePageMeta({
  middleware: (to) => {
    const path = to.hash === "#broker" ? "/connect/investments" : ["#exchange", "#wallet"].includes(to.hash) ? "/connect/crypto" : "/connect/banks"
    return navigateTo({ path, query: to.query, hash: to.hash }, { replace: true })
  },
})
</script>

<template>
  <div />
</template>
