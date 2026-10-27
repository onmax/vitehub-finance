<script setup lang="ts">
import type { Transaction, TransactionPage } from "#shared/api"

// Every transaction the caller may see, filtered by the URL's query (so a filtered view can be shared or reloaded):
// `view` (all, mine, in, out), `q`, `account`, `category` (an id or "none"), `from`, `to`. Pages load by cursor as
// you scroll. Changing a category shows at once and offers to apply it to similar transactions.
useHead({ get title() { return translate('transactions') } })
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
    moreError.value = errorText(cause, translate('couldnTLoadMoreTransactions'))
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

// Uncategorized rows AI hasn't looked at, sent to it; ones it isn't sure about keep their guess for their details.
const ai = useAiCategorize()

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
      title: name ? translate('movedTo', { value1: name }) : translate('categoryRemoved'),
      description: name ? translate('useForOtherTransactionsFromToo', { value1: name, value2: who }) : undefined,
      icon: "i-lucide-circle-check",
      duration: 8000,
      actions: name
        ? [{ get label() { return translate('applyToSimilar') }, color: "neutral", variant: "outline", size: "sm", onClick: () => void applyToSimilar(row, categoryId!) }]
        : undefined,
    })
  } catch (cause) {
    edits.value.set(row.id, row)
    notify.error(cause, translate('couldnTChangeTheCategory'))
  }
}

async function applyToSimilar(row: Transaction, categoryId: string) {
  try {
    await $fetch(`/api/transactions/${row.id}`, { method: "PATCH", body: { categoryId, applyToSimilar: true } })
    await refresh()
    void refreshStems("overview", "budgets")
    notify.success(translate('appliedToSimilarTransactions'), translate('newTransactionsLikeThisOneGetToo', { value1: find(categoryId)?.name ?? "it" }))
  } catch (cause) {
    notify.error(cause, translate('couldnTApplyItToSimilarTransactions'))
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
      <PageNavbar :title="$t('transactions')">
        <template v-if="ai.ready.value" #right>
          <UButton color="neutral" variant="outline" icon="i-lucide-sparkles" :label="$t('categorizeWithAi')" :loading="ai.running.value" class="hidden sm:inline-flex" @click="ai.run()" />
          <UButton color="neutral" variant="outline" icon="i-lucide-sparkles" :aria-label="$t('categorizeWithAi')" :loading="ai.running.value" class="size-10 justify-center sm:hidden" @click="ai.run()" />
        </template>
      </PageNavbar>
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
      <div class="flex min-h-10 flex-wrap items-center gap-x-5 gap-y-1 border-b border-default px-4 py-2 text-sm sm:px-6" aria-live="polite">
        <template v-if="loading && !page?.items.length">
          <USkeleton class="h-4 w-64" />
        </template>
        <template v-else>
          <span class="money text-muted">{{ $t('transactionsCount', { count: formatCount(totals.count) }, totals.count) }}</span>
          <span class="flex items-center gap-1.5">
            <span class="text-muted">{{ $t('in') }}</span>
            <Money :minor="totals.inMinor" tone="in" class="font-medium" />
          </span>
          <span class="flex items-center gap-1.5">
            <span class="text-muted">{{ $t('out') }}</span>
            <Money :minor="totals.outMinor ? -totals.outMinor : 0" class="font-medium text-highlighted" />
          </span>
        </template>
      </div>
    </template>

    <template #body>
      <div ref="body" class="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6">
        <div v-if="error" class="p-4 sm:p-6">
          <PageError :error="error" :title="$t('transactionsDidnTLoad')" @retry="refresh()" />
        </div>
        <UEmpty
          v-else-if="!loading && rows.length === 0 && filtered"
          icon="i-lucide-search"
          :title="$t('noTransactionsMatch')"
          :description="$t('tryOtherWordsAnotherAccountOrAWiderDateRange')"
          :actions="[{ label: $t('clearFilters'), color: 'neutral', variant: 'outline', onClick: () => router.replace({ query: {} }) }]"
          variant="naked"
          class="py-16"
        />
        <UEmpty
          v-else-if="!loading && rows.length === 0"
          icon="i-lucide-arrow-left-right"
          :title="$t('noTransactionsYet2')"
          :description="$t('connectABankToBringInAtLeastTheLast')"
          :actions="[
            { label: $t('connectABank'), to: '/connect/banks' },
            { label: $t('importACsv'), color: 'neutral', variant: 'outline', to: '/connect/banks#import' },
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
              :label="moreError ? $t('tryAgain') : $t('loadMore')"
              :loading="loadingMore"
              @click="(moreError = ''), loadMore()"
            />
          </div>
          <p v-else-if="rows.length > 20" class="border-t border-default p-4 text-center text-xs text-muted">{{ $t('thatSEverything') }}</p>
        </template>
      </div>

      <TransactionSlideover v-model:open="detailsOpen" :transaction="selected" @saved="onSaved" @category="changeCategory" />
    </template>
  </UDashboardPanel>
</template>
