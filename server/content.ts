// The docs at /docs: the Markdown in docs/, parsed by ViteHub Content and served at /api/content/** (the vite-hub Nuxt
// module finds this file). Keys keep their number prefixes (`2.providers/`), which order the sidebar; Comark drops
// them from the paths, and the `/docs` prefix makes each path its page's URL.
import toc from "comark/plugins/toc"
import comarkUi from "comark-ui/html"
import { contentSource, defineContent } from "vite-hub/content"
import { docs } from "./utils/docs-source"

/** The setup guide's live blocks only mean something in a browser, so agents read the page without them. */
const withoutLiveBlocks = (markdown: string) => markdown.replace(/^(:{2,})setup-(?:prompt|status)(?:\{[^}\n]*\})?\n\1\n\n?/gm, "")

export default defineContent({
  source: contentSource(docs, { prefix: "/docs", url: "/:id", markdown: ({ text }) => withoutLiveBlocks(text) }),
  seo: { markdown: true },
  markdown: { plugins: [...comarkUi({ chips: { download: false }, badge: { download: false } }).plugins, toc()] },
})
