<script setup lang="ts">
import type { Budget, BudgetsResponse } from "#shared/api"
import { BudgetModal } from "#components"

// Monthly limits per category: the household's and your own, how much of each is spent this month, and what was spent
// outside any budget. ?month=YYYY-MM picks the month.
useHead({ title: "Budgets" })
const route = useRoute()
const router = useRouter()
const month = computed<string>({
  get: () => (typeof route.query.month === "string" && /^\d{4}-\d{2}$/.test(route.query.month) ? route.query.month : currentMonth()),
  set: (value) => void router.replace({ query: { ...route.query, month: value === currentMonth() ? undefined : value } }),
})
const isCurrent = computed(() => month.value === currentMonth())

const { data, status, error, refresh } = useScopedFetch<BudgetsResponse | null>("/api/budgets", {
  key: "budgets",
  query: () => ({ month: month.value }),
  default: () => null,
})
const shared = useShared()
const notify = useNotify()
const confirm = useConfirm()
const { find } = useCategories()
const overlay = useOverlay()
const modal = overlay.create(BudgetModal, { destroyOnClose: true })

const currency = computed(() => data.value?.currency ?? "EUR")
const byName = (a: Budget, b: Budget) => (find(a.categoryId)?.name ?? "").localeCompare(find(b.categoryId)?.name ?? "")
const household = computed(() => (data.value?.items ?? []).filter((item) => item.ownerId === null).sort(byName))
const personal = computed(() => (data.value?.items ?? []).filter((item) => item.ownerId !== null).sort(byName))
const totals = computed(() => {
  // Household and personal budgets can cover the same spending, so the totals count one kind: the household's when there are any.
  const items = household.value.length ? household.value : personal.value
  const budgeted = items.reduce((sum, item) => sum + item.amountMinor, 0)
  const spent = items.reduce((sum, item) => sum + item.spentMinor, 0)
  return { budgeted, spent, share: budgeted > 0 ? spent / budgeted : 0 }
})
const sections = computed(() =>
  [
    { id: "household", title: shared.value ? "Household budgets" : "Budgets", note: shared.value ? "Count every shared account." : undefined, items: household.value },
    { id: "personal", title: "Your personal budgets", note: "Count only your own accounts. Only you see them.", items: personal.value },
  ].filter((section) => section.items.length > 0),
)

async function open(budget?: Budget, personalDefault = false) {
  const saved = await modal.open({ budget, currency: currency.value, personal: personalDefault }).result
  if (saved) notify.success(budget ? "Budget saved" : "Budget added", find(saved.categoryId)?.name)
}

async function remove(budget: Budget) {
  const name = find(budget.categoryId)?.name ?? "this category"
  const { confirmed } = await confirm({
    title: `Delete the ${name} budget?`,
    description: "Its spending stays; only the monthly limit goes.",
    confirmLabel: "Delete budget",
    destructive: true,
  })
  if (!confirmed) return
  try {
    await $fetch(`/api/budgets/${budget.id}`, { method: "DELETE" })
    await refresh()
    notify.success("Budget deleted")
  } catch (cause) {
    notify.error(cause, "Couldn’t delete the budget")
  }
}
const monthQuery = computed(() => ({ from: `${month.value}-01`, to: addDays(`${addMonths(month.value, 1)}-01`, -1) }))
</script>

<template>
  <UDashboardPanel id="budgets">
    <template #header>
      <PageNavbar title="Budgets">
        <template v-if="data?.items.length" #right>
          <UButton icon="i-lucide-plus" label="Add budget" class="hidden sm:inline-flex" @click="open()" />
          <UButton icon="i-lucide-plus" aria-label="Add budget" class="size-10 justify-center sm:hidden" @click="open()" />
        </template>
      </PageNavbar>
      <UDashboardToolbar>
        <template #left>
          <div class="flex items-center gap-1">
            <UTooltip text="Previous month">
              <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" size="sm" class="size-9 justify-center" aria-label="Previous month" @click="month = addMonths(month, -1)" />
            </UTooltip>
            <h2 class="min-w-32 text-center text-sm font-medium text-highlighted tabular-nums" aria-live="polite">{{ formatMonth(month) }}</h2>
            <UTooltip text="Next month">
              <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" size="sm" class="size-9 justify-center" aria-label="Next month" @click="month = addMonths(month, 1)" />
            </UTooltip>
            <UButton v-if="!isCurrent" label="This month" color="neutral" variant="outline" size="sm" class="ml-1" @click="month = currentMonth()" />
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageError v-if="error" :error="error" title="Budgets didn’t load" @retry="refresh()" />

      <template v-else-if="!data">
        <div class="rounded-xl border border-default p-5">
          <USkeleton class="h-4 w-32" />
          <USkeleton class="mt-3 h-8 w-48" />
          <USkeleton class="mt-4 h-2 w-full" />
        </div>
        <div class="divide-y divide-default rounded-xl border border-default">
          <div v-for="index in 4" :key="index" class="flex items-center gap-3 p-4">
            <USkeleton class="size-8 rounded-md" />
            <div class="flex-1">
              <USkeleton class="h-4 w-40" />
              <USkeleton class="mt-2 h-1.5 w-full" />
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="data.items.length === 0">
        <UEmpty
          variant="outline"
          icon="i-lucide-chart-pie"
          title="No budgets yet"
          description="Set a monthly limit for a category, like groceries or eating out, and see how much is left as the month goes."
          :actions="[{ label: 'Add a budget', icon: 'i-lucide-plus', onClick: () => open() }]"
        />
        <p v-if="data.unbudgetedMinor > 0" class="text-center text-sm text-muted">
          You spent <Money :minor="data.unbudgetedMinor" :currency="currency" class="font-medium text-highlighted" /> in {{ formatMonth(month) }}.
        </p>
      </template>

      <template v-else>
        <section
          aria-label="This month’s totals"
          class="rounded-xl border border-default bg-default p-4 shadow-xs transition-opacity duration-150 sm:p-5"
          :class="status === 'pending' && 'opacity-60'"
        >
          <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <p class="text-sm text-muted">Spent of budgeted</p>
              <p class="mt-1 text-2xl font-semibold tracking-[-0.02em] text-highlighted">
                <Money :minor="totals.spent" :currency="currency" />
                <span class="text-base font-normal text-muted"> of <Money :minor="totals.budgeted" :currency="currency" compact /></span>
              </p>
            </div>
            <p class="text-sm text-muted">
              <template v-if="totals.budgeted >= totals.spent">
                <Money :minor="totals.budgeted - totals.spent" :currency="currency" class="font-medium text-highlighted" /> left
              </template>
              <template v-else>
                <UIcon name="i-lucide-circle-alert" class="size-3.5 align-[-2px] text-error" />
                <Money :minor="totals.spent - totals.budgeted" :currency="currency" class="font-medium text-error" /> over
              </template>
            </p>
          </div>
          <UProgress
            class="mt-4"
            size="sm"
            :model-value="Math.min(100, Math.round(totals.share * 100))"
            :color="totals.share > 1 ? 'error' : totals.share >= 0.85 ? 'warning' : 'primary'"
            :aria-label="`${Math.round(totals.share * 100)}% of all budgets spent`"
          />
          <div class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-default pt-4 text-sm">
            <p class="text-muted">
              Outside any budget:
              <Money :minor="data.unbudgetedMinor" :currency="currency" class="font-medium text-highlighted" />
            </p>
            <UButton
              label="See transactions"
              trailing-icon="i-lucide-arrow-right"
              color="neutral"
              variant="link"
              size="sm"
              class="px-0"
              :to="{ path: '/transactions', query: { ...monthQuery, view: 'out' } }"
            />
          </div>
        </section>

        <section v-for="section in sections" :key="section.id" :aria-labelledby="`budgets-${section.id}`">
          <div class="mb-2 flex items-baseline justify-between gap-3">
            <h2 :id="`budgets-${section.id}`" class="text-sm font-medium text-muted">{{ section.title }}</h2>
            <p v-if="section.note" class="hidden text-xs text-muted sm:block">{{ section.note }}</p>
          </div>
          <ul
            class="divide-y divide-default rounded-xl border border-default bg-default shadow-xs transition-opacity duration-150"
            :class="status === 'pending' && 'opacity-60'"
          >
            <BudgetRow v-for="budget in section.items" :key="budget.id" :budget="budget" :currency="currency" @edit="open(budget)" @remove="remove(budget)" />
          </ul>
        </section>
        <UButton
          v-if="shared && personal.length === 0"
          label="Add a personal budget"
          icon="i-lucide-user"
          color="neutral"
          variant="ghost"
          class="self-start"
          @click="open(undefined, true)"
        />
      </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
