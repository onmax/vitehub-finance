<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui"
import type { Transaction } from "#shared/api"

// Mercury's transactions table: date, who and what (with a monogram), category (changeable in place), account and
// owner, and the amount on the right. On phones it becomes a list grouped by day. A row opens its details.
const props = defineProps<{ rows: Transaction[]; loading?: boolean; shared?: boolean }>()
const emit = defineEmits<{ open: [transaction: Transaction]; category: [transaction: Transaction, categoryId: string | null] }>()

const desktop = useMediaQuery("(min-width: 768px)")
const { find } = useCategories()
const title = (row: Transaction) => row.counterparty || row.description

const columns = computed<TableColumn<Transaction>[]>(() => [
  { accessorKey: "date", header: "Date", meta: { class: { th: "w-24", td: "w-24 money text-muted" } } },
  { id: "description", header: "Description", meta: { class: { td: "max-w-0" } } },
  { id: "category", header: "Category", meta: { class: { th: "w-48", td: "w-48 py-1.5" } } },
  { id: "account", header: "Account", meta: { class: { th: "w-48 hidden xl:table-cell", td: "w-48 hidden xl:table-cell" } } },
  { accessorKey: "amountMinor", header: "Amount", meta: { class: { th: "w-36 text-right", td: "w-36 text-right" } } },
])

const groups = computed(() => {
  const days = new Map<string, Transaction[]>()
  for (const row of props.rows) days.set(row.date, [...(days.get(row.date) ?? []), row])
  return [...days].map(([date, items]) => ({ date, items }))
})

// UTable rows are buttons for the mouse; Enter and Space open them from the keyboard too.
function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement
  if ((event.key !== "Enter" && event.key !== " ") || target.dataset.slot !== "tr") return
  event.preventDefault()
  target.click()
}
</script>

<template>
  <div>
    <template v-if="loading && rows.length === 0">
      <div class="divide-y divide-default" aria-busy="true" aria-label="Loading transactions">
        <div v-for="index in 8" :key="index" class="flex h-[53px] items-center gap-3 px-4">
          <USkeleton class="hidden h-4 w-14 md:block" />
          <USkeleton class="size-8 rounded-md" />
          <div class="flex flex-1 flex-col gap-1.5">
            <USkeleton class="h-3.5 w-40 max-w-full" />
            <USkeleton class="h-3 w-24 md:hidden" />
          </div>
          <USkeleton class="hidden h-6 w-32 md:block" />
          <USkeleton class="h-4 w-20" />
        </div>
      </div>
    </template>

    <UTable
      v-else-if="desktop"
      :data="rows"
      :columns="columns"
      :get-row-id="(row: Transaction) => row.id"
      sticky
      :on-select="(_event: Event, row: { original: Transaction }) => emit('open', row.original)"
      :ui="{
        base: 'table-fixed',
        thead: 'bg-default/90',
        th: 'px-4 first:ps-4 sm:first:ps-6 last:pe-4 sm:last:pe-6',
        td: 'px-4 first:ps-4 sm:first:ps-6 last:pe-4 sm:last:pe-6 text-default',
        tr: 'cursor-pointer',
      }"
      @keydown="onKeydown"
    >
      <template #date-cell="{ row }">{{ formatDay(row.original.date) }}</template>
      <template #description-cell="{ row }">
        <div class="flex min-w-0 items-center gap-3" :class="row.original.excluded && 'opacity-60'">
          <Monogram :name="title(row.original)" />
          <div class="min-w-0">
            <p class="flex items-center gap-1.5 truncate font-medium text-highlighted" :title="title(row.original)">
              <span class="truncate">{{ title(row.original) }}</span>
              <UIcon v-if="row.original.note" name="i-lucide-sticky-note" class="size-3.5 shrink-0 text-dimmed" aria-label="Has a note" />
            </p>
            <p v-if="row.original.transferWith" class="flex items-center gap-1 truncate text-xs text-muted">
              <UIcon name="i-lucide-arrow-left-right" class="size-3 shrink-0" />
              <span class="truncate">{{ row.original.amountMinor < 0 ? "To" : "From" }} {{ row.original.transferWith }}</span>
            </p>
            <p v-else-if="row.original.counterparty && row.original.description !== row.original.counterparty" class="truncate text-xs text-muted" :title="row.original.description">
              {{ row.original.description }}
            </p>
          </div>
          <UBadge v-if="row.original.status === 'pending'" color="neutral" variant="outline" size="sm" label="Pending" class="shrink-0" />
          <UBadge v-if="row.original.excluded" color="neutral" variant="outline" size="sm" icon="i-lucide-eye-off" label="Excluded" class="shrink-0" />
          <UBadge v-if="row.original.hidden" color="neutral" variant="outline" size="sm" icon="i-lucide-lock" label="Only you" class="shrink-0" />
        </div>
      </template>
      <template #category-cell="{ row }">
        <CategorySelect
          v-if="row.original.canEdit"
          :model-value="row.original.categoryId"
          variant="ghost"
          size="sm"
          class="w-full"
          :aria-label="`Category for ${title(row.original)}`"
          @update:model-value="(value) => emit('category', row.original, value ?? null)"
        />
        <span v-else class="flex items-center gap-2 text-sm" title="This account is shared view-only">
          <CategoryIcon :icon="find(row.original.categoryId)?.icon" :color="find(row.original.categoryId)?.color" size="sm" />
          <span class="truncate">{{ find(row.original.categoryId)?.name ?? "Uncategorized" }}</span>
        </span>
      </template>
      <template #account-cell="{ row }">
        <span class="flex min-w-0 items-center gap-2">
          <OwnerAvatar v-if="shared" :name="row.original.ownerName" :user-id="row.original.ownerId" size="3xs" />
          <span class="truncate text-muted" :title="row.original.accountName">{{ row.original.accountName }}</span>
        </span>
      </template>
      <template #amountMinor-cell="{ row }">
        <Money
          :minor="row.original.amountMinor"
          :currency="row.original.currency"
          tone="in"
          class="font-medium"
          :class="row.original.excluded && 'text-dimmed line-through'"
        />
      </template>
    </UTable>

    <div v-else class="flex flex-col">
      <section v-for="group in groups" :key="group.date" :aria-label="formatDay(group.date)">
        <h3 class="border-b border-default bg-muted px-4 py-1.5 text-xs font-medium text-muted">
          {{ formatDay(group.date) }}
        </h3>
        <ul class="divide-y divide-default">
          <li v-for="row in group.items" :key="row.id">
            <button
              type="button"
              class="flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition-colors duration-150 active:bg-elevated"
              :class="row.excluded && 'opacity-60'"
              @click="emit('open', row)"
            >
              <CategoryIcon :icon="find(row.categoryId)?.icon" :color="find(row.categoryId)?.color" />
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-1.5 text-sm font-medium text-highlighted">
                  <span class="truncate">{{ title(row) }}</span>
                  <UIcon v-if="row.hidden" name="i-lucide-lock" class="size-3.5 shrink-0 text-dimmed" aria-label="Only you see this" />
                </span>
                <span class="flex items-center gap-1.5 truncate text-xs text-muted">
                  <span v-if="row.transferWith" class="truncate">{{ row.accountName }} {{ row.amountMinor < 0 ? "→" : "←" }} {{ row.transferWith }}</span>
                  <span v-else class="truncate">{{ find(row.categoryId)?.name ?? "Uncategorized" }} · {{ row.accountName }}</span>
                  <span v-if="row.status === 'pending'" class="shrink-0">· Pending</span>
                </span>
              </span>
              <Money :minor="row.amountMinor" :currency="row.currency" tone="in" class="text-sm font-medium" :class="row.excluded && 'line-through'" />
            </button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
