// Nuxt UI types its docs components (UContentNavigation, UContentSurround) with @nuxt/content's navigation item, and
// the docs come from vite-hub/content instead (server/content.ts), so the package isn't installed. This is its shape.
declare module "@nuxt/content" {
  export interface ContentNavigationItem {
    title: string
    path: string
    stem?: string
    children?: ContentNavigationItem[]
    page?: false
    [key: string]: unknown
  }
}
