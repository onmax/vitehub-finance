<script setup lang="ts">
import { currentFormatLocale } from "~/lib/i18n"
import type { ForecastPayment, ForecastSeries } from "#shared/api"

// One expected payment: when (and how far it may move), who pays or is paid, from which account, the amount, and how
// sure the forecast is.
const props = defineProps<{ payment: ForecastPayment & { series: ForecastSeries }; today: string; currency: string }>()
const date = computed(() => utcDay(props.payment.date))
const month = computed(() => new Intl.DateTimeFormat(currentFormatLocale(), { month: "short", timeZone: "UTC" }).format(date.value))
</script>

<template>
  <li class="flex min-h-14 items-center gap-3 py-2">
    <span
      class="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg leading-none"
      :class="payment.amountMinor > 0 ? 'bg-emerald-500/10' : 'bg-elevated'"
      aria-hidden="true"
    >
      <span class="text-[10px] font-medium text-muted uppercase">{{ month }}</span>
      <span class="money mt-0.5 text-sm font-semibold text-highlighted">{{ date.getUTCDate() }}</span>
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-sm font-medium text-highlighted" :title="payment.series.name">{{ payment.series.name }}</span>
      <span class="block truncate text-xs text-muted">
        <span class="sr-only">{{ forecastDay(payment.date, today) }}, </span>{{ payment.series.dayRange ? $t('whenWithRange', { when: forecastWhen(payment.date, today), range: $t('d', { value1: payment.series.dayRange }) }) : forecastWhen(payment.date, today) }}
        · {{ payment.series.ownerName.split(" ")[0] }} · {{ payment.series.accountName }}
      </span>
    </span>
    <span class="flex shrink-0 flex-col items-end gap-0.5">
      <Money :minor="payment.amountMinor" :currency="currency" tone="in" signed original="below" class="text-sm font-medium text-highlighted" />
      <ForecastConfidence :series="payment.series" />
    </span>
  </li>
</template>
