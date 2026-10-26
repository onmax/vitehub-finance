import type { Overview } from "#shared/api"

/** The overview's data for the current scope; the sidebar reads its `attention` too. */
export function useOverview() {
  return useScopedFetch<Overview | null>("/api/overview", { key: "overview", default: () => null })
}
