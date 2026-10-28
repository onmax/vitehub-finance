// The docs at /docs: the Markdown in docs/, parsed by ViteHub Content and served at /api/content/** (the vite-hub Nuxt
// module finds this file). The files reach the server as Nitro server assets (`nitro.serverAssets` in nuxt.config.ts),
// so a Worker, which has no file system, reads the same pages as Node. Keys keep their number prefixes (`2.providers/`),
// which order the sidebar; Comark drops them from the paths, and the `/docs` prefix makes each path its page's URL.
import toc from "comark/plugins/toc"
import comarkUi from "comark-ui/html"
import { contentSource, defineContent } from "vite-hub/content"
import { defineSource } from "vite-hub/source"
import { useStorage } from "nitro/storage"

const assets = () => useStorage("assets:docs")
const byNumber = new Intl.Collator("en", { numeric: true })

const docs = defineSource({
  name: "docs",
  async getKeys() {
    // Storage keys use `:` where the files have `/`.
    const keys = await assets().getKeys()
    return keys.filter((key) => key.endsWith(".md")).map((key) => key.replaceAll(":", "/")).sort(byNumber.compare)
  },
  async getItem(key: string) {
    const content = await assets().getItem<string>(key.replaceAll("/", ":"))
    return { key, content: String(content ?? ""), mediaType: "text/markdown" }
  },
})

export const content = defineContent({
  source: contentSource(docs, { prefix: "/docs" }),
  markdown: { plugins: [...comarkUi({ chips: { download: false }, badge: { download: false } }).plugins, toc()] },
})
