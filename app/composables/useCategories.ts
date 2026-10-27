import type { Category } from "#shared/api"

/** The household's categories, fetched once, with lookups by id. */
export function useCategories() {
  const request = useFetch<Category[]>("/api/categories", {
    key: "categories",
    default: () => [],
    getCachedData: cachedUnlessRefreshed,
    lazy: true,
    transform: expectJson,
  })
  const byId = computed(() => new Map(request.data.value.map((category) => [category.id, category])))
  const find = (id: string | null | undefined) => (id ? byId.value.get(id) : undefined)
  /** Items for a USelectMenu: expense, income, and transfer categories, with Uncategorized first. */
  const items = computed(() => [
    { id: null as string | null, get name() { return translate('uncategorized') }, icon: "i-lucide-circle-help", color: "neutral", kind: "expense" as const },
    ...[...request.data.value].sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || a.name.localeCompare(b.name)),
  ])
  return { ...request, categories: request.data, byId, find, items }
}

const kindOrder = (kind: Category["kind"]) => ({ expense: 0, income: 1, transfer: 2 })[kind]
