<script setup lang="ts">
// Where a month's money came from and where it went, as a sankey, with the month's totals above it and the same
// numbers as a table below. Moves between your own accounts stay out, and the card says how much they were.
import type { FlowNode, MoneyFlow } from "#shared/api"

const month = ref(currentMonth())
const isCurrent = computed(() => month.value === currentMonth())
const { data: flow, status, error, refresh } = useScopedFetch<MoneyFlow | null>("/api/flow", {
  key: "flow",
  query: computed(() => ({ month: month.value })),
  default: () => null,
})
const { format } = useMoney()
const router = useRouter()
const { categories } = useCategories()

const savings = computed(() => flow.value?.sources.find((node) => node.kind === "savings") ?? null)
const kept = computed(() => flow.value?.uses.find((node) => node.kind === "kept") ?? null)
const showTable = ref(false)
const tables = computed(() => (flow.value ? [{ title: "Came from", nodes: flow.value.sources }, { title: "Went to", nodes: flow.value.uses }] : []))
const share = (minor: number) => `${Math.round((minor / Math.max(1, flow.value?.inMinor ?? 0, flow.value?.outMinor ?? 0)) * 100)}%`
const empty = computed(() => flow.value && !flow.value.inMinor && !flow.value.outMinor)

function open(node: FlowNode) {
  if (!flow.value) return
  const range = { from: flow.value.from, to: flow.value.to }
  const direction = flow.value.sources.includes(node) ? "in" : "out"
  const category = node.id === "uncategorized" || node.id === "uncategorized-in" ? "none" : node.categoryId ?? undefined
  void router.push({ path: "/transactions", query: { ...range, view: direction, ...(category ? { category } : {}) } })
}

const transfersLink = computed(() => {
  const transfers = categories.value?.find((entry) => entry.kind === "transfer")
  return { path: "/transactions", query: { from: flow.value?.from, to: flow.value?.to, ...(transfers ? { category: transfers.id } : {}) } }
})
</script>

<template>
  <SectionCard title="Money flow">
    <template #action>
      <div class="-me-2 flex items-center gap-1">
        <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" size="sm" aria-label="Previous month" @click="month = addMonths(month, -1)" />
        <span class="min-w-24 text-center text-sm font-medium text-highlighted tabular-nums">{{ formatMonth(month) }}</span>
        <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" size="sm" aria-label="Next month" :disabled="isCurrent" @click="month = addMonths(month, 1)" />
      </div>
    </template>

    <PageError v-if="error && !flow" :error="error" @retry="refresh()" />
    <div v-else-if="!flow" class="flex flex-col gap-4">
      <div class="flex gap-6"><USkeleton class="h-10 w-28" /><USkeleton class="h-10 w-28" /><USkeleton class="h-10 w-28" /></div>
      <USkeleton class="h-60 w-full" />
    </div>
    <p v-else-if="empty" class="py-10 text-center text-sm text-pretty text-muted">
      Nothing came in or went out in {{ formatMonth(month) }}<template v-if="flow.movedMinor">, besides moves between your accounts</template>.
    </p>
    <div v-else class="flex flex-col gap-5 transition-opacity duration-150" :class="status === 'pending' && 'opacity-60'" :aria-busy="status === 'pending'">
      <dl class="flex flex-wrap gap-x-8 gap-y-3">
        <div>
          <dt class="flex items-center gap-1.5 text-xs text-muted"><span class="size-2 rounded-full bg-emerald-500" aria-hidden="true" />Money in</dt>
          <dd class="money mt-0.5 text-lg font-semibold text-highlighted">{{ format(flow.inMinor, flow.currency) }}</dd>
        </div>
        <div>
          <dt class="flex items-center gap-1.5 text-xs text-muted"><span class="size-2 rounded-full bg-rose-500" aria-hidden="true" />Money out</dt>
          <dd class="money mt-0.5 text-lg font-semibold text-highlighted">{{ format(flow.outMinor, flow.currency) }}</dd>
        </div>
        <div v-if="kept">
          <dt class="text-xs text-muted">Kept</dt>
          <dd class="money mt-0.5 text-lg font-semibold text-emerald-600 dark:text-emerald-400">+{{ format(kept.amountMinor, flow.currency) }}</dd>
        </div>
        <div v-else-if="savings">
          <dt class="text-xs text-muted">From savings</dt>
          <dd class="money mt-0.5 text-lg font-semibold text-amber-600 dark:text-amber-400">{{ format(savings.amountMinor, flow.currency) }}</dd>
        </div>
      </dl>

      <FlowChart :flow="flow" @open="open" />

      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-default pt-3 text-xs text-muted">
        <p v-if="flow.movedMinor > 0" class="flex items-center gap-1.5">
          <UIcon name="i-lucide-arrow-left-right" class="size-3.5 shrink-0" />
          <span>
            <ULink :to="transfersLink" class="money underline decoration-dotted underline-offset-4 hover:text-highlighted">{{ format(flow.movedMinor, flow.currency) }}</ULink>
            moved between your accounts isn’t counted.
          </span>
        </p>
        <span v-else />
        <UButton
          :label="showTable ? 'Hide table' : 'Show as a table'"
          color="neutral"
          variant="link"
          size="xs"
          class="px-0 text-muted"
          :aria-expanded="showTable"
          aria-controls="flow-table"
          @click="showTable = !showTable"
        />
      </div>
      <div v-if="showTable" id="flow-table" class="grid gap-6 sm:grid-cols-2">
        <table v-for="side in tables" :key="side.title" class="w-full text-sm">
          <caption class="pb-2 text-left text-xs font-medium text-muted">{{ side.title }}</caption>
          <tbody class="divide-y divide-default">
            <tr v-for="node in side.nodes" :key="node.id">
              <th scope="row" class="py-1.5 text-left font-normal">
                <span class="flex items-center gap-2">
                  <span class="size-2 shrink-0 rounded-full" :class="categoryColor(node.color).solid" aria-hidden="true" />
                  <span class="truncate">{{ node.name }}</span>
                </span>
              </th>
              <td class="money py-1.5 text-right text-highlighted">{{ format(node.amountMinor, flow.currency) }}</td>
              <td class="w-12 py-1.5 text-right text-xs text-muted tabular-nums">{{ share(node.amountMinor) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </SectionCard>
</template>
