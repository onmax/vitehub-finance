<script setup lang="ts">
import { currentFormatLocale } from "~/lib/i18n"
import type { TableColumn } from "@nuxt/ui"
import type { Holding } from "#shared/api"

// What a crypto or investment account holds: each asset's quantity, price, value, and share of the account.
const props = defineProps<{ holdings: Holding[]; currency: string }>()
const { format } = useMoney()
const total = computed(() => props.holdings.reduce((sum, holding) => sum + holding.valueMinor, 0))
const quantity = (value: number) =>
  new Intl.NumberFormat(currentFormatLocale(), { maximumSignificantDigits: 8 }).format(value)
const columns: TableColumn<Holding>[] = [
  { accessorKey: "symbol", get header() { return translate('asset') } },
  { accessorKey: "quantity", get header() { return translate('quantity') }, meta: { class: { th: "text-right", td: "text-right" } } },
  { accessorKey: "priceMinor", get header() { return translate('price') }, meta: { class: { th: "text-right hidden sm:table-cell", td: "text-right hidden sm:table-cell" } } },
  { accessorKey: "valueMinor", get header() { return translate('value') }, meta: { class: { th: "text-right", td: "text-right" } } },
]
</script>

<template>
  <section class="border-t border-default" aria-labelledby="holdings">
    <header class="flex h-12 items-center justify-between gap-3">
      <h2 id="holdings" class="text-sm font-medium text-highlighted">{{ $t('holdings') }}</h2>
      <span class="money text-sm text-muted">{{ $t('asset2', { count: formatCount(holdings.length) }, holdings.length) }}</span>
    </header>
    <UTable :data="holdings" :columns="columns" :ui="{ th: 'px-3 first:ps-0 last:pe-0', td: 'px-3 first:ps-0 last:pe-0' }">
      <template #symbol-cell="{ row }">
        <div class="flex min-w-0 items-center gap-2.5">
          <!-- A fund goes by its name, its ISIN under it; a ticker or a coin by its symbol. -->
          <template v-if="isFundCode(row.original.symbol) && row.original.name">
            <span class="grid size-7 shrink-0 place-items-center rounded-md bg-elevated text-toned">
              <UIcon name="i-lucide-chart-pie" class="size-3.5" />
            </span>
            <div class="min-w-0">
              <p class="truncate font-medium text-highlighted">{{ row.original.name }}</p>
              <p class="truncate font-mono text-xs text-muted">{{ row.original.symbol }}</p>
            </div>
          </template>
          <template v-else>
            <span class="grid size-7 shrink-0 place-items-center rounded-md bg-elevated text-[10px] font-semibold text-toned">
              {{ row.original.symbol.slice(0, 4) }}
            </span>
            <div class="min-w-0">
              <p class="truncate font-medium text-highlighted">{{ row.original.symbol }}</p>
              <p v-if="assetName(row.original.symbol, row.original.name)" class="truncate text-xs text-muted">{{ assetName(row.original.symbol, row.original.name) }}</p>
            </div>
          </template>
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
          <Money :minor="row.original.valueMinor" :currency="currency" original="below" class="font-medium text-highlighted" />
          <span v-if="total > 0" class="money text-xs text-muted">{{ formatPercent(row.original.valueMinor / total, { digits: 1 }) }}</span>
        </div>
      </template>
    </UTable>
  </section>
</template>
