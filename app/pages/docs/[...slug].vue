<script setup lang="ts">
import UContentNavigation from "@nuxt/ui/components/content/ContentNavigation.vue"
import UContentSurround from "@nuxt/ui/components/content/ContentSurround.vue"
import UContentToc from "@nuxt/ui/components/content/ContentToc.vue"
import { MarkdownDocument } from "@comark/vue"
import comarkUi, { criticCss } from "comark-ui/vue"

const { components } = comarkUi({ chips: { download: false }, badge: { download: false } })
useHead({ style: [{ key: "comark-critic", textContent: criticCss }] })
definePageMeta({ layout: "docs" })
const route = useRoute()
const path = computed(() => route.path.replace(/\/+$/, "") || "/docs")
const { data: navigation } = useDocsNavigation()
const { data: page, status } = useAsyncData(
  () => `docs:${path.value}`,
  () => docsClient().get(path.value).catch(() => null),
)
useHead({ title: () => (page.value?.data.title ? `${page.value.data.title} · ${translate('docs')}` : translate('docs')) })

// The group a page sits in, as its headline, and its neighbours in reading order.
const flat = (items: DocsNavigationItem[], group?: string): Array<DocsNavigationItem & { group?: string }> =>
  items.flatMap((item) => (item.children?.length ? flat(item.children, item.title) : [{ ...item, group }]))
const pages = computed(() => flat(navigation.value))
const index = computed(() => pages.value.findIndex((item) => item.path === path.value))
const headline = computed(() => pages.value[index.value]?.group)
const surround = computed(() => [pages.value[index.value - 1], pages.value[index.value + 1]].map((item) => item ?? null) as DocsNavigationItem[])
const toc = computed(() => (page.value?.meta.toc as { links?: DocsTocLink[] } | undefined)?.links ?? [])
</script>

<template>
  <UPage>
    <template #left>
      <UPageAside>
        <UContentNavigation v-if="navigation.length" :navigation="navigation" highlight />
      </UPageAside>
    </template>

    <template v-if="page">
      <UPageHeader :title="page.data.title" :description="page.data.description" :headline="headline" />
      <UPageBody>
        <MarkdownDocument :value="{ nodes: page.nodes }" :components="components" />
        <USeparator v-if="surround.some(Boolean)" />
        <UContentSurround :surround="surround" />
      </UPageBody>
    </template>
    <UPageBody v-else-if="status !== 'pending'">
      <UEmpty icon="i-lucide-file-question" :title="$t('pageNotFound')" :actions="[{ label: $t('docs'), to: '/docs', color: 'neutral', variant: 'outline' }]" />
    </UPageBody>

    <template v-if="toc.length" #right>
      <UContentToc :links="toc" highlight />
    </template>
  </UPage>
</template>
