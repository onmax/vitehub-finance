import type { AiRoute } from "#shared/api"

/** How AI categories reach Jev, by name. Brands, so the same in every language. */
export const AI_ROUTE_NAMES: Record<AiRoute, string> = {
  typesafe: "TypeSafe",
  vercel: "Vercel AI Gateway",
  cloudflare: "Cloudflare AI Gateway",
}
