<script setup lang="ts">
import type { Transaction } from "#shared/api"
import { formatMoney } from "#shared/money"

const props = defineProps<{ transaction: Transaction }>()
const emit = defineEmits<{ saved: [transaction: Transaction] }>()
const choosing = shallowRef(false)
const linkedRefunds = ref<Transaction[]>([])
const candidates = ref<Transaction[]>([])
const chosen = shallowRef<string | undefined>()
const busy = shallowRef(false)
const error = shallowRef("")
const items = computed(() => candidates.value.map((row) => ({ value: row.id, label: `${row.date} · ${row.counterparty || row.description} · ${formatMoney(row.amountMinor, row.currency)}` })))
watch(() => props.transaction.id, async (id, _old, onCleanup) => {
  choosing.value = false
  chosen.value = undefined
  error.value = ""
  linkedRefunds.value = []
  if (props.transaction.amountMinor >= 0) return
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  try {
    const rows = await $fetch<Transaction[]>(`/api/transactions/${id}/refunds`, { signal: controller.signal })
    if (!controller.signal.aborted) linkedRefunds.value = rows
  } catch (cause) {
    if (!controller.signal.aborted) error.value = errorText(cause, translate('couldnTChangeThat'))
  }
}, { immediate: true })
async function unlinkRefund(row: Transaction) {
  busy.value = true
  error.value = ""
  try {
    const saved = await $fetch<Transaction>(`/api/transactions/${row.id}`, { method: "PATCH", body: { reimbursementOf: null } })
    linkedRefunds.value = linkedRefunds.value.filter((item) => item.id !== row.id)
    emit("saved", saved)
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTChangeThat'))
  } finally { busy.value = false }
}
async function choose() {
  busy.value = true
  error.value = ""
  const id = props.transaction.id
  try {
    const rows = await $fetch<Transaction[]>(`/api/transactions/${id}/refunds`)
    if (id !== props.transaction.id) return
    candidates.value = rows
    choosing.value = true
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTChangeThat'))
  } finally {
    busy.value = false
  }
}
async function save(reimbursementOf: string | null) {
  busy.value = true
  error.value = ""
  try {
    emit("saved", await $fetch<Transaction>(`/api/transactions/${props.transaction.id}`, { method: "PATCH", body: { reimbursementOf } }))
    choosing.value = false
    await refreshStems("overview", "budgets", "forecast")
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTChangeThat'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section v-if="(transaction.amountMinor > 0 && !transaction.review?.splits.length && !transaction.transferWith) || linkedRefunds.length || error" class="space-y-3" :aria-label="$t('transactionRefund')">
    <h3 class="text-sm font-medium">{{ $t('transactionRefund') }}</h3>
    <p class="text-xs text-muted">{{ $t('transactionRefundHelp') }}</p>
    <ul v-if="linkedRefunds.length" class="divide-y divide-default rounded-lg border border-default px-3">
      <li v-for="row in linkedRefunds" :key="row.id" class="flex items-center gap-2 py-2 text-sm">
        <NuxtLink :to="`/transactions?transaction=${row.id}`" class="min-w-0 flex-1 truncate hover:underline">{{ row.counterparty || row.description }} · {{ formatDate(row.date) }}</NuxtLink>
        <Money :minor="row.amountMinor" :currency="row.currency" />
        <DemoLock v-if="row.canEdit" v-slot="{ locked }"><UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-unlink" :aria-label="$t('transactionUnlinkRefund')" :disabled="locked" :loading="busy" @click="unlinkRefund(row)" /></DemoLock>
      </li>
    </ul>
    <div v-if="transaction.review?.reimbursementOf" class="flex flex-wrap items-center gap-2">
      <UBadge color="neutral" variant="subtle" icon="i-lucide-undo-2" :label="$t('transactionRefundLinked')" />
      <DemoLock v-if="transaction.canEdit" v-slot="{ locked }"><UButton size="sm" color="neutral" variant="outline" :label="$t('transactionUnlinkRefund')" :loading="busy" :disabled="locked" @click="save(null)" /></DemoLock>
    </div>
    <DemoLock v-else-if="transaction.amountMinor > 0 && transaction.canEdit && !choosing" v-slot="{ locked }"><UButton size="sm" color="neutral" variant="outline" icon="i-lucide-link" :label="$t('transactionLinkRefund')" :loading="busy" :disabled="locked" @click="choose" /></DemoLock>
    <div v-if="choosing" class="space-y-2">
      <USelectMenu v-model="chosen" :items="items" value-key="value" label-key="label" :placeholder="$t('transactionChooseExpense')" :aria-label="$t('transactionChooseExpense')" :disabled="busy" class="w-full" />
      <p v-if="!candidates.length" class="text-xs text-muted">{{ $t('transactionNoRefundCandidates') }}</p>
      <div class="flex gap-2">
        <DemoLock v-slot="{ locked }"><UButton :label="$t('transactionLinkRefund')" :disabled="!chosen || locked" :loading="busy" @click="chosen && save(chosen)" /></DemoLock>
        <UButton color="neutral" variant="outline" :label="$t('cancel')" :disabled="busy" @click="choosing = false" />
      </div>
    </div>
    <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
  </section>
</template>
