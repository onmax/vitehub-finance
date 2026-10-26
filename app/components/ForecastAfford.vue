<script setup lang="ts">
import type { Forecast } from "#shared/api"
import { parseAmount, toMinor } from "#shared/money"

// "Can we afford it?": a one-off expense in a month, taken off every projected balance from that month on. The answer
// is the lowest balance left afterwards, and whether it stays above zero.
const props = defineProps<{ forecast: Forecast }>()
const { format } = useMoney()

const amount = ref("")
const month = ref(props.forecast.months[0]?.month ?? "")
watch(
  () => props.forecast.months.map((entry) => entry.month).join(),
  () => {
    if (!props.forecast.months.some((entry) => entry.month === month.value)) month.value = props.forecast.months[0]?.month ?? ""
  },
)
const monthItems = computed(() => props.forecast.months.map((entry) => ({ value: entry.month, label: formatMonth(entry.month) })))

const parsed = computed(() => (amount.value.trim() ? parseAmount(amount.value) : null))
const invalid = computed(() => amount.value.trim() !== "" && (parsed.value === null || parsed.value <= 0))
const result = computed(() => {
  if (parsed.value === null || parsed.value <= 0) return null
  const cost = toMinor(parsed.value, props.forecast.currency)
  const start = props.forecast.months.findIndex((entry) => entry.month === month.value)
  if (start === -1) return null
  const after = props.forecast.months.slice(start).map((entry) => ({ ...entry, balanceMinor: entry.balanceMinor - cost }))
  const lowest = after.reduce((low, entry) => (entry.balanceMinor < low.balanceMinor ? entry : low), after[0]!)
  return { cost, lowest, ok: lowest.balanceMinor >= 0 }
})
const money = (minor: number) => format(minor, props.forecast.currency)
</script>

<template>
  <section aria-labelledby="afford-title" class="rounded-xl border border-default bg-default p-4 shadow-xs sm:p-5">
    <h2 id="afford-title" class="text-sm font-medium text-highlighted">Can we afford it?</h2>
    <p class="mt-1 text-sm text-muted">A one-off expense, taken off the projection from the month you pick.</p>
    <div class="mt-4 grid grid-cols-2 gap-3">
      <UFormField label="Amount" :error="invalid ? 'Enter an amount above zero, like 1.200' : undefined">
        <UInput
          v-model="amount"
          inputmode="decimal"
          placeholder="1.200,00"
          class="w-full"
          :ui="{ base: 'tabular-nums' }"
          aria-describedby="afford-result"
        />
      </UFormField>
      <UFormField label="Month">
        <USelect v-model="month" :items="monthItems" class="w-full" />
      </UFormField>
    </div>
    <div id="afford-result" aria-live="polite" class="mt-4">
      <UAlert
        v-if="result && result.ok"
        color="neutral"
        variant="outline"
        :ui="{ icon: 'text-success', description: 'text-muted' }"
        icon="i-lucide-circle-check"
        title="Yes, the balance stays above zero"
        :description="`After spending ${money(result.cost)}, the lowest projected balance is ${money(result.lowest.balanceMinor)} in ${formatMonth(result.lowest.month)}.`"
      />
      <UAlert
        v-else-if="result"
        color="neutral"
        variant="outline"
        :ui="{ icon: 'text-warning', description: 'text-muted' }"
        icon="i-lucide-triangle-alert"
        title="Not without going below zero"
        :description="`After spending ${money(result.cost)}, the balance would fall to ${money(result.lowest.balanceMinor)} in ${formatMonth(result.lowest.month)}. Wait a few months, or spread it out.`"
      />
      <p v-else class="text-sm text-muted">Enter an amount to see the lowest balance it leaves you with.</p>
    </div>
  </section>
</template>
