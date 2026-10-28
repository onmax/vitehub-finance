<script setup lang="ts">
import type { Transaction } from "#shared/api"
import { currencyDigits, fromMinor, parseAmount, toMinor } from "#shared/money"

const props = defineProps<{ transaction: Transaction }>()
const emit = defineEmits<{ saved: [transaction: Transaction] }>()
const { find } = useCategories()
const editing = shallowRef(false)
const busy = shallowRef(false)
const error = shallowRef("")
const draft = ref<Array<{ key: string; categoryId: string | null; amount: string }>>([])
const splits = computed(() => props.transaction.review?.splits ?? [])
const parsed = computed(() => draft.value.map((part) => ({ categoryId: part.categoryId, amountMinor: Math.sign(props.transaction.amountMinor) * Math.abs(toMinor(parseAmount(part.amount) ?? 0, props.transaction.currency)) })))
const remainder = computed(() => Math.abs(props.transaction.amountMinor) - parsed.value.reduce((sum, part) => sum + Math.abs(part.amountMinor), 0))
const valid = computed(() => parsed.value.length >= 2 && parsed.value.length <= 20 && parsed.value.every((part) => part.amountMinor !== 0) && remainder.value === 0)
watch(() => props.transaction.id, () => { editing.value = false; error.value = "" })
function edit() {
  const parts = splits.value.length ? splits.value : [{ categoryId: props.transaction.categoryId, amountMinor: props.transaction.amountMinor }, { categoryId: null, amountMinor: 0 }]
  draft.value = parts.map((part) => ({ key: crypto.randomUUID(), categoryId: part.categoryId, amount: String(Math.abs(fromMinor(part.amountMinor, props.transaction.currency))) }))
  editing.value = true
  error.value = ""
}
function add() {
  draft.value.push({ key: crypto.randomUUID(), categoryId: null, amount: remainder.value > 0 ? String(fromMinor(remainder.value, props.transaction.currency)) : "" })
}
async function save(remove = false) {
  if (!remove && !valid.value) return
  busy.value = true
  error.value = ""
  try {
    emit("saved", await $fetch<Transaction>(`/api/transactions/${props.transaction.id}`, { method: "PATCH", body: { splits: remove ? null : parsed.value } }))
    editing.value = false
    await refreshStems("overview", "budgets", "forecast")
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTChangeThat'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="space-y-3" :aria-label="$t('transactionSplit')">
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-sm font-medium">{{ $t('transactionSplit') }}</h3>
      <DemoLock v-if="transaction.canEdit && !editing && !transaction.transferWith && !transaction.review?.reimbursementOf" v-slot="{ locked }">
        <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-split" :label="splits.length ? $t('edit') : $t('transactionAddSplit')" :disabled="locked" @click="edit" />
      </DemoLock>
    </div>
    <p class="text-xs text-muted">{{ $t('transactionSplitHelp') }}</p>
    <ul v-if="!editing && splits.length" class="divide-y divide-default rounded-lg border border-default px-3">
      <li v-for="(part, index) in splits" :key="index" class="flex items-center justify-between gap-2 py-2 text-sm">
        <span class="flex min-w-0 items-center gap-2"><CategoryIcon :icon="find(part.categoryId)?.icon" :color="find(part.categoryId)?.color" size="sm" /><span class="truncate">{{ find(part.categoryId)?.name ?? $t('uncategorized') }}</span></span>
        <Money :minor="part.amountMinor" :currency="transaction.currency" />
      </li>
    </ul>
    <form v-if="editing" class="space-y-3" :aria-busy="busy" @submit.prevent="save()">
      <div v-for="(part, index) in draft" :key="part.key" class="flex items-start gap-2">
        <CategorySelect v-model="part.categoryId" :kinds="['expense', 'income']" :aria-label="$t('transactionSplitCategory', { number: index + 1 })" :disabled="busy" class="min-w-0 flex-1" />
        <UInput v-model="part.amount" inputmode="decimal" :aria-label="$t('transactionSplitAmount', { number: index + 1, currency: transaction.currency })" :placeholder="(0).toFixed(currencyDigits(transaction.currency))" :disabled="busy" class="w-28" />
        <UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="$t('transactionRemoveSplit', { number: index + 1 })" :disabled="busy || draft.length <= 2" @click="draft.splice(index, 1)" />
      </div>
      <div class="flex items-center justify-between gap-2">
        <UButton size="sm" color="neutral" variant="link" icon="i-lucide-plus" :label="$t('transactionAddSplit')" :disabled="busy || draft.length >= 20" @click="add" />
        <p class="flex items-center gap-1 text-xs" :class="remainder === 0 ? 'text-success' : 'text-muted'" role="status">{{ $t('transactionRemaining') }} <Money :minor="remainder" :currency="transaction.currency" /></p>
      </div>
      <p v-if="!valid" class="text-xs text-muted">{{ $t('transactionSplitMustBalance') }}</p>
      <div class="flex flex-wrap gap-2">
        <UButton type="submit" :label="$t('save')" :loading="busy" :disabled="!valid" />
        <UButton color="neutral" variant="outline" :label="$t('cancel')" :disabled="busy" @click="editing = false" />
        <UButton v-if="splits.length" color="neutral" variant="ghost" :label="$t('transactionRemoveSplits')" :disabled="busy" @click="save(true)" />
      </div>
    </form>
    <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
  </section>
</template>
