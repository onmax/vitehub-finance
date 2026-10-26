<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui"
import type { Holding } from "#shared/api"

// What a crypto or investment account holds: each asset's quantity, price, value, and share of the account.
const props = defineProps<{ holdings: Holding[]; currency: string }>()
const { format } = useMoney()
const total = computed(() => props.holdings.reduce((sum, holding) => sum + holding.valueMinor, 0))
const quantity = (value: number) =>
  new Intl.NumberFormat(typeof navigator === "undefined" ? undefined : navigator.language, { maximumSignificantDigits: 8 }).format(value)
const columns: TableColumn<Holding>[] = [
  { accessorKey: "symbol", header: "Asset" },
  { accessorKey: "quantity", header: "Quantity", meta: { class: { th: "text-right", td: "text-right" } } },
  { accessorKey: "priceMinor", header: "Price", meta: { class: { th: "text-right hidden sm:table-cell", td: "text-right hidden sm:table-cell" } } },
  { accessorKey: "valueMinor", header: "Value", meta: { class: { th: "text-right", td: "text-right" } } },
]
</script>

<template>
  <section class="overflow-hidden rounded-xl border border-default bg-default shadow-xs" aria-labelledby="holdings">
    <header class="flex items-baseline justify-between gap-3 border-b border-default px-4 py-3 sm:px-5">
      <h2 id="holdings" class="text-sm font-medium text-highlighted">Holdings</h2>
      <span class="money text-sm text-muted">{{ holdings.length }} asset{{ holdings.length === 1 ? "" : "s" }}</span>
    </header>
    <UTable :data="holdings" :columns="columns" :ui="{ th: 'px-4 sm:px-5', td: 'px-4 sm:px-5' }">
      <template #symbol-cell="{ row }">
        <div class="flex min-w-0 items-center gap-2.5">
          <span class="grid size-7 shrink-0 place-items-center rounded-md border border-default bg-elevated text-[10px] font-semibold text-toned">
            {{ row.original.symbol.slice(0, 4) }}
          </span>
          <div class="min-w-0">
            <p class="truncate font-medium text-highlighted">{{ row.original.symbol }}</p>
            <p v-if="row.original.name" class="truncate text-xs text-muted">{{ row.original.name }}</p>
          </div>
        </div>
      </template>
      <template #quantity-cell="{ row }">
        <span class="money">{{ quantity(row.original.quantity) }}</span>
      </template>
      <template #priceMinor-cell="{ row }">
        <span class="money text-muted">{{ row.original.priceMinor === null ? "—" : format(row.original.priceMinor, currency) }}</span>
      </template>
      <template #valueMinor-cell="{ row }">
        <div class="flex flex-col items-end">
          <span class="money font-medium text-highlighted">{{ format(row.original.valueMinor, currency) }}</span>
          <span v-if="total > 0" class="money text-xs text-muted">{{ formatPercent(row.original.valueMinor / total, { digits: 1 }) }}</span>
        </div>
      </template>
    </UTable>
  </section>
</template>
