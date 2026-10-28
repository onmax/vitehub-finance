import { createContentClient, type ContentFetch } from "vite-hub/content/client"

/** A page, or a folder of pages, in the docs' tree. */
export type DocsNavigationItem = import("comark-content").NavigationItem

/** A section in a page's table of contents (comark/plugins/toc). */
export type DocsTocLink = import("comark/plugins/toc").TocLink

// Typed by URL, `$fetch` checks every server route against a plain string and runs out of stack.
const fetchContent: ContentFetch = (url, options) => ($fetch as unknown as ContentFetch)(url, options)

// The docs (server/content.ts), read from /api/content/**. Page paths are their URLs: `/docs/providers/kraken`.
export const docsClient = () => createContentClient({ fetch: fetchContent })

/**
 * The pages' tree, for the sidebar and the previous and next links. One request, shared by the layout and the page.
 * Render the sidebar once it's in: its groups open when it's created.
 */
export const useDocsNavigation = () =>
  useAsyncData(
    "docs-navigation",
    async () => {
      // The `/docs` prefix wraps everything in one root item, /docs itself; the sidebar starts below it. Links are
      // exact, or /docs would stay highlighted on every page under it.
      const tree = await docsClient().navigation()
      const exact = (items: DocsNavigationItem[]): DocsNavigationItem[] =>
        items.map((item) => ({ ...item, exact: true, ...(item.children ? { children: exact(item.children) } : {}) }))
      return exact(tree.length === 1 && tree[0]!.path === "/docs" && tree[0]!.children ? tree[0]!.children : tree)
    },
    { default: (): DocsNavigationItem[] => [] },
  )

/** Where a provider's guide is, from its catalog id (app/utils/connect-catalog.ts). */
export const providerDocs = (id: string) => `/docs/providers/${id}`
