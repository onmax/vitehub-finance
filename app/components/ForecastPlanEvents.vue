<script setup lang="ts">
import type { PlanningForecast, PlannedEvent } from '#shared/planning'
import type { ForecastScenario } from '#shared/forecast'
import { parseAmount, toMinor, fromMinor } from '#shared/money'
const props = defineProps<{ forecast: PlanningForecast }>()
const scenario = defineModel<ForecastScenario>({ required: true })
const { format } = useMoney()
const editing = shallowRef<string | null>(null)
const opened = shallowRef(false)
const name = shallowRef('')
const amount = shallowRef('')
const kind = shallowRef<'income' | 'expense'>('expense')
const date = shallowRef(props.forecast.today)
const endDate = shallowRef('')
const cadence = shallowRef<PlannedEvent['cadence']>('once')
const accountId = shallowRef(props.forecast.accounts[0]?.id ?? '')
const visibleEvents = computed(() => (scenario.value.events ?? []).filter(event => props.forecast.accounts.some(account => account.id === event.accountId)))
const accounts = computed(() => props.forecast.accounts.map(account => ({ label: account.name, value: account.id })))
const kinds = computed(() => [{ label: translate('planningExpense'), value: 'expense' }, { label: translate('income'), value: 'income' }])
const cadences = computed(() => [
  { label: translate('planningOnce'), value: 'once' },
  { label: translate('weekly'), value: 'weekly' }, { label: translate('monthly'), value: 'monthly' },
  { label: translate('planningQuarterly'), value: 'quarterly' }, { label: translate('yearly'), value: 'yearly' },
])
const valid = computed(() => name.value.trim() && (parseAmount(amount.value) ?? 0) > 0 && accounts.value.some(account => account.value === accountId.value) && date.value >= props.forecast.today && (!endDate.value || endDate.value >= date.value))
function edit(event?: PlannedEvent) {
  editing.value = event?.id ?? null
  name.value = event?.name ?? ''
  amount.value = event ? String(fromMinor(event.amountMinor, props.forecast.currency)) : ''
  kind.value = event?.kind ?? 'expense'
  date.value = event?.date ?? props.forecast.today
  endDate.value = event?.endDate ?? ''
  cadence.value = event?.cadence ?? 'once'
  accountId.value = event?.accountId ?? props.forecast.accounts[0]?.id ?? ''
  opened.value = true
}
function save() {
  if (!valid.value) return
  const event: PlannedEvent = { id: editing.value ?? crypto.randomUUID(), name: name.value.trim(), accountId: accountId.value, kind: kind.value, amountMinor: toMinor(parseAmount(amount.value)!, props.forecast.currency), date: date.value, cadence: cadence.value, endDate: endDate.value || null }
  scenario.value = { ...scenario.value, events: [...(scenario.value.events ?? []).filter(item => item.id !== event.id), event] }
  opened.value = false
}
function remove(id: string) { scenario.value = { ...scenario.value, events: scenario.value.events?.filter(event => event.id !== id) } }
</script>

<template>
  <SectionCard :title="$t('planningEvents')" body-class="gap-4">
    <template #action><UButton :label="$t('planningAddEvent')" icon="i-lucide-plus" variant="link" size="sm" @click="edit()" /></template>
    <p class="text-sm text-muted">{{ $t('planningEventsHelp') }}</p>
    <ul v-if="visibleEvents.length" class="divide-y divide-default">
      <li v-for="event in visibleEvents" :key="event.id" class="flex items-center gap-3 py-3">
        <div class="min-w-0 flex-1">
          <p class="font-medium text-highlighted">{{ event.name }}</p>
          <p class="text-xs text-muted">{{ event.date }} · {{ forecast.accounts.find(account => account.id === event.accountId)?.name }} · {{ cadences.find(item => item.value === event.cadence)?.label }}</p>
          <p class="money text-sm">{{ format(event.kind === 'income' ? event.amountMinor : -event.amountMinor, forecast.currency, { signed: true }) }}</p>
        </div>
        <UButton :label="$t('edit')" variant="ghost" color="neutral" size="sm" @click="edit(event)" />
        <UButton :aria-label="$t('delete4', { value1: event.name })" icon="i-lucide-trash-2" variant="ghost" color="error" size="sm" @click="remove(event.id)" />
      </li>
    </ul>
    <form v-if="opened" class="grid grid-cols-2 gap-3 rounded-lg border border-default p-4" @submit.prevent="save">
      <UFormField :label="$t('name')" class="col-span-2" required><UInput v-model="name" maxlength="120" class="w-full" /></UFormField>
      <UFormField :label="$t('planningEventType')"><USelect v-model="kind" :items="kinds" class="w-full" /></UFormField>
      <UFormField :label="`${$t('amount')} (${forecast.currency})`" required><UInput v-model="amount" inputmode="decimal" class="w-full" /></UFormField>
      <UFormField :label="$t('account')" class="col-span-2"><USelect v-model="accountId" :items="accounts" class="w-full" /></UFormField>
      <UFormField :label="$t('date')"><DateInput v-model="date" :min="forecast.today" class="w-full" /></UFormField>
      <UFormField :label="$t('planningRepeat')"><USelect v-model="cadence" :items="cadences" class="w-full" /></UFormField>
      <UFormField v-if="cadence !== 'once'" :label="$t('planningEndDate')" class="col-span-2"><UInput v-model="endDate" type="date" :min="date" class="w-full" /></UFormField>
      <p v-if="!valid" class="col-span-2 text-xs text-muted">{{ $t('planningEventValidation') }}</p>
      <div class="col-span-2 flex gap-2"><UButton type="submit" :label="$t('save')" :disabled="!valid" /><UButton :label="$t('cancel')" color="neutral" variant="ghost" @click="opened = false" /></div>
    </form>
  </SectionCard>
</template>
