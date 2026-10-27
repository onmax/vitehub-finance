<script setup lang="ts">
import type { Alert } from "#shared/api"
import type { RouteLocationRaw } from "vue-router"

// One alert in the Alerts inbox: what it's about with its mark, why in a sentence, the one thing to do about it, and
// dismiss (or restore, once dismissed). Severity reads as a colored dot with its name for screen readers. Rows align
// to the top, so a detail that wraps doesn't pull the mark and buttons off the title.
const props = defineProps<{ alert: Alert }>()
defineEmits<{ dismiss: []; restore: [] }>()
const { format } = useMoney()
const { categories } = useCategories()
const { pending, reconnect, reason } = useReconnect()

const SEVERITY = {
  critical: { dot: "bg-error", get label() { return translate('alertSeverityCritical') } },
  warning: { dot: "bg-warning", get label() { return translate('alertSeverityWarning') } },
  info: { dot: "bg-(--ui-text-dimmed)", get label() { return translate('alertSeverityInfo') } },
}
const severity = computed(() => SEVERITY[props.alert.severity])

const category = computed(() => (props.alert.kind === "budget" ? categories.value?.find((entry) => entry.id === (props.alert as Extract<Alert, { kind: "budget" }>).categoryId) : undefined))

const text = computed((): { title: string; detail: string } => {
  const alert = props.alert
  switch (alert.kind) {
    case "connection":
      return { title: alert.connection.institution ?? alert.connection.name, detail: reason(alert.connection) }
    case "budget": {
      const name = category.value?.name ?? translate('uncategorized')
      const over = alert.spentMinor > alert.amountMinor
      return {
        title: over ? translate('alertBudgetOverTitle', { category: name }) : translate('alertBudgetNearTitle', { category: name, percent: formatPercent(alert.spentMinor / alert.amountMinor) }),
        detail: translate('alertBudgetDetail', { spent: format(alert.spentMinor, alert.currency), amount: format(alert.amountMinor, alert.currency), month: formatMonth(alert.month) }),
      }
    }
    case "low_balance":
      return {
        title: alert.thresholdMinor === 0
          ? translate('alertLowBalanceZeroTitle', { date: formatDay(alert.date) })
          : translate('alertLowBalanceTitle', { threshold: format(alert.thresholdMinor, alert.currency), date: formatDay(alert.date) }),
        detail: translate('alertLowBalanceDetail', { balance: format(alert.balanceMinor, alert.currency) }),
      }
    case "large_transaction":
      return {
        title: translate('alertLargeTitle', { amount: format(-alert.amountMinor, alert.currency), name: alert.description }),
        detail: translate('alertLargeDetail', { account: alert.account, date: formatDay(alert.date) }),
      }
    case "price_increase":
      return {
        title: translate('alertPriceTitle', { name: alert.name, percent: formatPercent(alert.percent / 100) }),
        detail: translate('alertPriceDetail', { latest: format(alert.latestMinor, alert.currency), previous: format(alert.previousMinor, alert.currency) }),
      }
  }
  return { title: "", detail: "" }
})

const action = computed((): { label: string; to: RouteLocationRaw } | null => {
  const alert = props.alert
  if (alert.kind === "budget") return { label: translate('alertSeeBudget'), to: "/budgets" }
  if (alert.kind === "low_balance") return { label: translate('alertSeeForecast'), to: "/forecast" }
  if (alert.kind === "price_increase") return { label: translate('alertSeeRecurring'), to: "/recurring" }
  if (alert.kind === "large_transaction") return { label: translate('alertSeePayment'), to: { path: "/transactions", query: { q: alert.description, from: alert.date, to: alert.date } } }
  return null
})
</script>

<template>
  <li class="flex flex-wrap items-start gap-x-3 gap-y-3 py-4 sm:flex-nowrap">
    <!-- A bank or a category is worth a mark; the other kinds already show theirs in the group's heading. -->
    <InstitutionMark v-if="alert.kind === 'connection'" :provider="alert.connection.provider" :name="alert.connection.institution ?? alert.connection.name" :logo="alert.connection.logo" />
    <CategoryIcon v-else-if="alert.kind === 'budget'" :icon="category?.icon" :color="category?.color" />

    <!-- The dot sits in a column as wide as the heading's icon, so titles line up with the heading. -->
    <div class="grid min-w-0 flex-1 basis-56 grid-cols-[0.875rem_minmax(0,1fr)] gap-x-2">
      <span class="mt-[7px] size-1.5 justify-self-center rounded-full" :class="alert.dismissedAt ? 'bg-(--ui-border-accented)' : severity.dot" aria-hidden="true" />
      <p class="text-sm/5 font-medium text-pretty break-words text-highlighted">
        <span class="sr-only">{{ severity.label }}:</span>
        {{ text.title }}
      </p>
      <p class="col-start-2 mt-1 max-w-prose text-sm text-pretty text-muted">{{ text.detail }}</p>
      <p v-if="alert.dismissedAt" class="col-start-2 mt-1 text-xs text-dimmed">{{ $t('alertDismissedOn', { date: formatDay(alert.dismissedAt.slice(0, 10)) }) }}</p>
    </div>

    <!-- Level with the title's first line: an 8-high button around a 5-high line. -->
    <div class="ms-auto flex shrink-0 items-center gap-1 sm:-my-1.5">
      <template v-if="!alert.dismissedAt">
        <template v-if="alert.kind === 'connection'">
          <DemoLock v-if="alert.connection.canManage" v-slot="{ locked }">
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              :icon="alert.connection.provider === 'enable_banking' ? 'i-lucide-link' : 'i-lucide-refresh-cw'"
              :label="alert.connection.provider === 'enable_banking' ? $t('reconnect') : $t('tryAgain')"
              :loading="pending === alert.connection.id"
              :disabled="locked"
              @click="reconnect(alert.connection)"
            />
          </DemoLock>
          <span v-else class="text-xs text-muted">{{ $t('canReconnectIt', { value1: alert.connection.ownerName }) }}</span>
        </template>
        <UButton v-else-if="action" color="neutral" variant="outline" size="sm" :label="action.label" :to="action.to" />
        <UTooltip :text="$t('dismiss')">
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-x" class="size-8 justify-center" :aria-label="`${$t('dismiss')}: ${text.title}`" @click="$emit('dismiss')" />
        </UTooltip>
      </template>
      <UButton v-else color="neutral" variant="ghost" size="sm" icon="i-lucide-undo-2" :label="$t('restore')" @click="$emit('restore')" />
    </div>
  </li>
</template>
