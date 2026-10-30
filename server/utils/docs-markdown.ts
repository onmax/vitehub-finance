/**
 * The docs as Markdown, for agents: `/docs/guides/setup.md`, or `/docs/guides/setup` asked for with
 * `Accept: text/markdown`. A file's key keeps its number prefixes (`1.guides/0.setup.md`), which the page URL drops.
 */

/** The docs page a request asks for as Markdown (`/docs/guides/setup`), or null when it wants the page itself. */
export function markdownRequest(pathname: string, accept: string | null): string | null {
  if (pathname !== "/docs" && pathname !== "/docs.md" && !pathname.startsWith("/docs/")) return null
  const md = pathname.endsWith(".md")
  if (!md && !/\btext\/markdown\b/i.test(accept ?? "")) return null
  const path = (md ? pathname.slice(0, -3) : pathname).replace(/\/+$/, "").replace(/\/index$/, "")
  return path || "/docs"
}

/** A docs file's page URL: `1.guides/0.setup.md` is `/docs/guides/setup`, `0.index.md` is `/docs`. */
export function pagePath(key: string) {
  const segments = key.replace(/\.md$/, "").split("/").map((segment) => segment.replace(/^\d+\./, ""))
  if (segments.at(-1) === "index") segments.pop()
  return ["/docs", ...segments].join("/")
}

/** The page's Markdown without the setup guide's live blocks, which only mean something in a browser. */
export const withoutLiveBlocks = (markdown: string) => markdown.replace(/^(:{2,})setup-(?:prompt|status)(?:\{[^}\n]*\})?\n\1\n\n?/gm, "")
