import type { AccountSummary } from "#shared/api"

/** The accounts the caller sees in the current scope (archived ones only when asked). */
export function useAccounts(options: { archived?: MaybeRefOrGetter<boolean> } = {}) {
  return useScopedFetch<AccountSummary[]>("/api/accounts", {
    key: "accounts",
    query: () => ({ archived: toValue(options.archived) ? 1 : undefined }),
    default: () => [],
  })
}
