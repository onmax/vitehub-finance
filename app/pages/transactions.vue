<script setup lang="ts">
import type { Transaction, TransactionPage } from "#shared/api"

// Every transaction the caller may see, filtered by the URL's query (so a filtered view can be shared or reloaded):
// `view` (all, mine, in, out), `q`, `account`, `category` (an id or "none"), `from`, `to`. Pages load by cursor as
// you scroll. Changing a category shows at once and offers to apply it to similar transactions.
useHead({ title: "Transactions" })
type View = "all" | "mine" | "in" | "out"

const route = useRoute()
const router = useRouter()
const notify = useNotify()
const toast = useToast()
const scope = useScope()
const shared = useShared()
const { find } = useCategories()
const { data: accounts } = useAccounts()

const read = (key: string) => (typeof route.query[key] === "string" ? (route.query[key] as string) : "")
function setQuery(patch: Record<string, string>) {
  const query = { ...route.query }
  for (const [key, value] of Object.entries(patch)) {
    if (value) query[key] = value
    else delete query[key]
  }
  void router.replace({ query })
}
const param = (key: string) => computed({ get: () => read(key), set: (value: string) => setQuery({ [key]: value }) })
const view = computed<View>({
  get: () => (["mine", "in", "out"].includes(read("view")) ? (read("view") as View) : "all"),
  set: (value) => setQuery({ view: value === "all" ? "" : value }),
})
const account = param("account")
const category = param("category")
const from = param("from")
const to = param("to")

// The box updates at once; the URL and the request follow a pause in typing.
const search = ref(read("q"))
watchDebounced(search, (value) => setQuery({ q: value.trim() }), { debounce: 300 })
watch(
  () => route.query.q,
  (value) => {
    if ((value ?? "") !== search.value.trim()) search.value = typeof value === "string" ? value : ""
  },
)

const filters = computed(() => ({
  q: read("q"),
  account: account.value,
  category: category.value,
  from: from.value,
  to: to.value,
  direction: view.value === "in" || view.value === "out" ? view.value : undefined,
  // "Mine" narrows this table to your own accounts, whatever the page-wide scope says.
  scope: view.value === "mine" ? "me" : undefined,
  limit: 50,
}))
const empty = (): TransactionPage => ({ items: [], nextCursor: null, totals: { inMinor: 0, outMinor: 0, count: 0 } })
const { data: page, status, error, refresh } = useScopedFetch<TransactionPage>("/api/transactions", {
  key: "transactions",
  query: filters,
  default: empty,
})

// Later pages, appended below the first. A new first page (other filters, a refresh) starts over.
const more = ref<Transaction[]>([])
const cursor = ref<string | null>(null)
const loadingMore = ref(false)
const moreError = ref("")
watch(
  page,
  (value) => {
    more.value = []
    cursor.value = value?.nextCursor ?? null
    moreError.value = ""
  },
  { immediate: true },
)
async function loadMore() {
  if (!cursor.value || loadingMore.value) return
  loadingMore.value = true
  moreError.value = ""
  try {
    const query = Object.fromEntries(
      Object.entries({ ...filters.value, scope: filters.value.scope ?? scope.value, cursor: cursor.value }).filter(([, value]) => value !== undefined && value !== ""),
    )
    const next = await $fetch<TransactionPage>("/api/transactions", { query })
    more.value.push(...next.items)
    cursor.value = next.nextCursor
  } catch (cause) {
    moreError.value = errorText(cause, "Couldn’t load more transactions.")
  } finally {
    loadingMore.value = false
  }
}

// Edits made here, shown before the server answers and kept until the list reloads.
const edits = ref(new Map<string, Transaction>())
watch(page, () => (edits.value = new Map()))
const rows = computed(() => [...(page.value?.items ?? []), ...more.value].map((row) => edits.value.get(row.id) ?? row))

const body = useTemplateRef<HTMLElement>("body")
const scroller = computed(() => body.value?.closest<HTMLElement>("[data-slot='body']") ?? null)
useInfiniteScroll(scroller, loadMore, { distance: 400, canLoadMore: () => Boolean(cursor.value) && !moreError.value })

async function changeCategory(row: Transaction, categoryId: string | null) {
  if (row.categoryId === categoryId) return
  edits.value.set(row.id, { ...row, categoryId })
  try {
    const saved = await $fetch<Transaction>(`/api/transactions/${row.id}`, { method: "PATCH", body: { categoryId } })
    edits.value.set(row.id, saved)
    void refreshStems("overview", "budgets")
    const name = find(categoryId)?.name
    const who = row.counterparty || row.description
    toast.add({
      title: name ? `Moved to ${name}` : "Category removed",
      description: name ? `Use ${name} for other transactions from ${who} too?` : undefined,
      icon: "i-lucide-circle-check",
      duration: 8000,
      actions: name
        ? [{ label: "Apply to similar", color: "neutral", variant: "outline", size: "sm", onClick: () => void applyToSimilar(row, categoryId!) }]
        : undefined,
    })
  } catch (cause) {
    edits.value.set(row.id, row)
    notify.error(cause, "Couldn’t change the category")
  }
}

async function applyToSimilar(row: Transaction, categoryId: string) {
  try {
    await $fetch(`/api/transactions/${row.id}`, { method: "PATCH", body: { categoryId, applyToSimilar: true } })
    await refresh()
    void refreshStems("overview", "budgets")
    notify.success(`Applied to similar transactions`, `New transactions like this one get ${find(categoryId)?.name ?? "it"} too.`)
  } catch (cause) {
    notify.error(cause, "Couldn’t apply it to similar transactions")
  }
}

const selectedId = ref<string | null>(null)
const selected = computed(() => rows.value.find((row) => row.id === selectedId.value) ?? null)
const detailsOpen = ref(false)
function open(row: Transaction) {
  selectedId.value = row.id
  detailsOpen.value = true
}
const onSaved = (saved: Transaction) => edits.value.set(saved.id, saved)

const loading = computed(() => status.value === "pending" || status.value === "idle")
const filtered = computed(() => Boolean(read("q") || account.value || category.value || from.value || to.value || view.value !== "all"))
const totals = computed(() => page.value?.totals ?? empty().totals)
</script>

<template>
  <UDashboardPanel id="transactions">
    <template #header>
      <PageNavbar title="Transactions" />
      <UDashboardToolbar :ui="{ root: 'py-2 overflow-visible', left: 'w-full min-w-0' }">
        <template #left>
          <TransactionsFilters
            v-model:view="view"
            v-model:search="search"
            v-model:account="account"
            v-model:category="category"
            v-model:from="from"
            v-model:to="to"
            :accounts="accounts"
          />
        </template>
      </UDashboardToolbar>
      <div class="flex min-h-10 items-center gap-x-5 gap-y-1 border-b border-default px-4 py-2 text-sm sm:px-6" aria-live="polite">
        <template v-if="loading && !page?.items.length">
          <USkeleton class="h-4 w-64" />
        </template>
        <template v-else>
          <span class="money text-muted">{{ formatCount(totals.count) }} {{ totals.count === 1 ? "transaction" : "transactions" }}</span>
          <span class="flex items-center gap-1.5">
            <span class="text-muted">In</span>
            <Money :minor="totals.inMinor" tone="in" class="font-medium" />
          </span>
          <span class="flex items-center gap-1.5">
            <span class="text-muted">Out</span>
            <Money :minor="totals.outMinor ? -totals.outMinor : 0" class="font-medium text-highlighted" />
          </span>
        </template>
      </div>
    </template>

    <template #body>
      <div ref="body" class="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6">
        <div v-if="error" class="p-4 sm:p-6">
          <PageError :error="error" title="Transactions didn’t load" @retry="refresh()" />
        </div>
        <UEmpty
          v-else-if="!loading && rows.length === 0 && filtered"
          icon="i-lucide-search"
          title="No transactions match"
          description="Try other words, another account, or a wider date range."
          :actions="[{ label: 'Clear filters', color: 'neutral', variant: 'outline', onClick: () => router.replace({ query: {} }) }]"
          variant="naked"
          class="py-16"
        />
        <UEmpty
          v-else-if="!loading && rows.length === 0"
          icon="i-lucide-arrow-left-right"
          title="No transactions yet"
          description="Connect a bank and Joxi brings in the last 90 days or more, then keeps them up to date. You can also import a CSV."
          :actions="[
            { label: 'Connect a bank', to: '/connect' },
            { label: 'Import a CSV', color: 'neutral', variant: 'outline', to: '/connect#import' },
          ]"
          variant="naked"
          class="py-16"
        />
        <template v-else>
          <TransactionsTable :rows="rows" :loading="loading" :shared="shared" @open="open" @category="changeCategory" />
          <div v-if="cursor || loadingMore || moreError" class="flex flex-col items-center gap-2 border-t border-default p-4">
            <p v-if="moreError" class="text-sm text-error" role="alert">{{ moreError }}</p>
            <UButton
              color="neutral"
              variant="outline"
              :label="moreError ? 'Try again' : 'Load more'"
              :loading="loadingMore"
              @click="(moreError = ''), loadMore()"
            />
          </div>
          <p v-else-if="rows.length > 20" class="border-t border-default p-4 text-center text-xs text-muted">That’s everything.</p>
        </template>
      </div>

      <TransactionSlideover v-model:open="detailsOpen" :transaction="selected" @saved="onSaved" @category="changeCategory" />
    </template>
  </UDashboardPanel>
</template>
