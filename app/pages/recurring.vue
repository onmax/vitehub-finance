<script setup lang="ts">
import type { Recurring, RecurringResponse } from "#shared/api"

// Subscriptions, bills, and regular income ViteHub Finance found in the transactions: what they cost a month and a year, ways to
// save, and each payment by when it's next due. Detected ones wait for a confirm or a dismiss.
useHead({ get title() { return translate('recurring') } })

const notify = useNotify()
const shared = useShared()
const { format } = useMoney()
const { data, status, error, refresh } = useScopedFetch<RecurringResponse>("/api/recurring", {
  key: "recurring",
  default: () => ({ currency: "EUR", items: [], totals: { monthlyOutMinor: 0, yearlyOutMinor: 0, monthlyInMinor: 0 }, insights: [] }),
})
const loading = computed(() => status.value === "pending" || status.value === "idle")

// Status changes show at once and roll back if the server refuses.
const edits = ref(new Map<string, Recurring>())
watch(data, () => (edits.value = new Map()))
const items = computed(() => (data.value?.items ?? []).map((item) => edits.value.get(item.id) ?? item))
const pending = ref<string[]>([])

const kind = ref<"out" | "in">("out")
const hasIncome = computed(() => items.value.some((item) => item.amountMinor > 0 && item.status !== "dismissed"))
const active = computed(() => items.value.filter((item) => item.status !== "dismissed" && (kind.value === "out" ? item.amountMinor < 0 : item.amountMinor > 0)))
const dismissed = computed(() => items.value.filter((item) => item.status === "dismissed"))
const detectedCount = computed(() => active.value.filter((item) => item.status === "detected").length)
const showDismissed = ref(false)

async function setStatus(item: Recurring, status: Recurring["status"]) {
  edits.value.set(item.id, { ...item, status })
  pending.value.push(item.id)
  try {
    const saved = await $fetch<Recurring>(`/api/recurring/${item.id}`, { method: "PATCH", body: { status } })
    edits.value.set(item.id, saved)
    void refreshStems("overview", "forecast")
    if (status === "dismissed")
      notify.success(translate('isnTCountedAsRecurring', { value1: item.name }), translate('itStaysOutOfTotalsAndTheForecastRestoreIt'))
  } catch (cause) {
    edits.value.set(item.id, item)
    notify.error(cause, translate('couldnTUpdateIt'))
  } finally {
    pending.value = pending.value.filter((id) => id !== item.id)
  }
}

async function confirmAll() {
  for (const item of active.value.filter((entry) => entry.status === "detected")) await setStatus(item, "confirmed")
}

// "Show" on an insight: briefly marks its payments and scrolls to the first.
const highlighted = refAutoReset<string[]>([], 2400)
const motion = usePreferredReducedMotion()
async function show(ids: string[]) {
  kind.value = "out"
  highlighted.value = ids
  await nextTick()
  document.getElementById(`recurring-${ids[0]}`)?.scrollIntoView({
    behavior: motion.value === "reduce" ? "auto" : "smooth",
    block: "center",
  })
}
</script>

<template>
  <UDashboardPanel id="recurring">
    <template #header>
      <PageNavbar :title="$t('recurring')" />
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-10">
      <PageError v-if="error" :error="error" :title="$t('recurringPaymentsDidnTLoad')" @retry="refresh()" />

      <template v-else-if="loading && !data?.items.length">
        <div class="grid shrink-0 grid-cols-3 divide-x divide-default">
          <div v-for="index in 3" :key="index" class="flex flex-col gap-2 px-4 first:ps-0 sm:px-6">
            <USkeleton class="h-4 w-24" />
            <USkeleton class="h-7 w-32" />
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <USkeleton class="h-4 w-28" />
          <div class="divide-y divide-default border-t border-default">
            <div v-for="index in 5" :key="index" class="flex items-center gap-3 py-3">
              <USkeleton class="size-8 rounded-md" />
              <div class="flex flex-1 flex-col gap-1.5">
                <USkeleton class="h-3.5 w-36" />
                <USkeleton class="h-3 w-24" />
              </div>
              <USkeleton class="h-4 w-16" />
            </div>
          </div>
        </div>
      </template>

      <UEmpty
        v-else-if="items.length === 0"
        icon="i-lucide-repeat"
        :title="$t('noRecurringPaymentsYet')"
        :description="$t('subscriptionsAndBillsShowUpHereOnceAnAccountHas')"
        :actions="[
          { label: $t('connectABank'), to: '/connect/banks' },
          { label: $t('importACsv'), color: 'neutral', variant: 'outline', to: '/connect/banks#import' },
        ]"
        variant="naked"
        class="py-16"
      />

      <template v-else>
        <dl class="grid shrink-0 grid-cols-3 divide-x divide-default">
          <div class="flex min-w-0 flex-col gap-1 px-3 first:ps-0 sm:px-6">
            <dt class="text-xs text-muted sm:text-sm">{{ $t('chargesAMonth') }}</dt>
            <dd class="text-lg font-semibold sm:text-2xl sm:tracking-[-0.02em] text-highlighted"><Money :minor="data!.totals.monthlyOutMinor" original="below" align="start" /></dd>
          </div>
          <div class="flex min-w-0 flex-col gap-1 px-3 first:ps-0 sm:px-6">
            <dt class="text-xs text-muted sm:text-sm">{{ $t('chargesAYear') }}</dt>
            <dd class="text-lg font-semibold sm:text-2xl sm:tracking-[-0.02em] text-highlighted"><Money :minor="data!.totals.yearlyOutMinor" compact original="below" align="start" /></dd>
          </div>
          <div class="flex min-w-0 flex-col gap-1 px-3 first:ps-0 sm:px-6">
            <dt class="text-xs text-muted sm:text-sm">{{ $t('incomeAMonth') }}</dt>
            <dd class="text-lg font-semibold sm:text-2xl sm:tracking-[-0.02em]" :class="data!.totals.monthlyInMinor > 0 ? 'money-in' : 'text-highlighted'">
              <Money :minor="data!.totals.monthlyInMinor" original="below" align="start" />
            </dd>
          </div>
        </dl>

        <RecurringInsights :insights="data!.insights" @show="show" />

        <section aria-labelledby="upcoming-title" class="flex flex-col gap-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 id="upcoming-title" class="text-sm font-medium text-highlighted">
              {{ kind === "out" ? $t('upcomingCharges') : $t('upcomingIncome') }}
            </h2>
            <div class="flex items-center gap-2">
              <UButton
                v-if="detectedCount > 1"
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-check-check"
                :label="$t('confirmAll', { value1: detectedCount })"
                @click="confirmAll"
              />
              <SegmentedControl
                v-if="hasIncome"
                v-model="kind"
                size="sm"
                :label="$t('chargesOrIncome')"
                :options="[
                  { value: 'out', label: $t('charges') },
                  { value: 'in', label: $t('income') },
                ]"
              />
            </div>
          </div>
          <RecurringList v-if="active.length" :items="active" :highlighted="highlighted" :shared="shared" :pending="pending" @status="setStatus" />
          <p v-else class="rounded-lg bg-muted p-6 text-center text-sm text-muted">
            {{ kind === "out" ? $t('noRecurringChargesRightNow') : $t('noRegularIncomeFoundYet') }}
          </p>
        </section>

        <section v-if="dismissed.length" class="flex flex-col gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            class="self-start"
            :trailing-icon="showDismissed ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            :label="$t('notRecurring2', { value1: dismissed.length })"
            :aria-expanded="showDismissed"
            @click="showDismissed = !showDismissed"
          />
          <ul v-if="showDismissed" class="divide-y divide-default border-t border-default">
            <li v-for="item in dismissed" :key="item.id" class="flex items-center gap-3 py-2.5">
              <span class="min-w-0 flex-1 truncate text-sm text-muted">{{ item.name }}</span>
              <Money :minor="item.amountMinor" :currency="item.currency" original="below" class="text-sm text-muted" />
              <UButton color="neutral" variant="outline" size="sm" :label="$t('restore')" :loading="pending.includes(item.id)" @click="setStatus(item, 'detected')" />
            </li>
          </ul>
        </section>
      </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
