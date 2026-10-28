<script setup lang="ts">
import type { Transaction } from "#shared/api"
import { canEdit, canSeeTransaction } from "#shared/access"
import type { TransactionBulkResult } from "#shared/review"

const props = defineProps<{ rows: Transaction[] }>()
const emit = defineEmits<{ saved: [items: Transaction[]]; clear: []; undone: [] }>()
const busy = shallowRef(false)
const error = shallowRef("")
const chosenCategory = shallowRef<string | null | undefined>()
const undoToken = shallowRef<string | null>(null)
const notify = useNotify()
const { data: me } = useMe()
const { data: accounts } = useAccounts()
const demo = useDemoPerson()
const assignee = shallowRef("")
const people = computed(() => (me.value?.members ?? []).filter((person) => props.rows.every((row) => {
  const account = accounts.value.find((item) => item.id === row.accountId)
  return account && canEdit(account, person.userId) && canSeeTransaction(account, row, person.userId)
})).map((person) => ({ value: person.userId, label: person.name })))

async function apply(change: { categoryId?: string | null; reviewed?: boolean; assignedTo?: string | null }) {
  if (busy.value || !props.rows.length) return
  busy.value = true
  error.value = ""
  try {
    const result = await $fetch<TransactionBulkResult>("/api/transactions/bulk", { method: "POST", body: { ids: props.rows.map((row) => row.id), change } })
    undoToken.value = result.undoToken
    emit("saved", result.items)
    emit("clear")
    chosenCategory.value = undefined
    assignee.value = ""
    await refreshStems("overview", "budgets", "forecast", "setup")
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTChangeThat'))
  } finally {
    busy.value = false
  }
}
async function undo() {
  if (!undoToken.value || busy.value) return
  busy.value = true
  error.value = ""
  try {
    await $fetch("/api/transactions/undo", { method: "POST", body: { token: undoToken.value } })
    undoToken.value = null
    emit("undone")
    await refreshStems("overview", "budgets", "forecast", "setup")
    notify.success(translate('transactionBulkUndone'))
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTChangeThat'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="rows.length || undoToken || error" class="border-b border-default bg-elevated/50 px-4 py-3 sm:px-6">
    <div v-if="rows.length" class="flex flex-wrap items-center gap-2" :aria-busy="busy">
      <span class="me-2 text-sm font-medium" aria-live="polite">{{ $t('transactionSelected', { count: rows.length }) }}</span>
      <CategorySelect v-model="chosenCategory" :disabled="busy || !!demo" :placeholder="$t('transactionBulkCategory')" class="w-44" />
      <DemoLock v-slot="{ locked }"><UButton color="neutral" variant="outline" :label="$t('apply')" :disabled="busy || locked || chosenCategory === undefined" @click="apply({ categoryId: chosenCategory ?? null })" /></DemoLock>
      <DemoLock v-slot="{ locked }"><UButton icon="i-lucide-check-check" :label="$t('transactionMarkReviewed')" :disabled="busy || locked" @click="apply({ reviewed: true })" /></DemoLock>
      <DemoLock v-slot="{ locked }"><UButton color="neutral" variant="outline" :label="$t('transactionMarkUnreviewed')" :disabled="busy || locked" @click="apply({ reviewed: false })" /></DemoLock>
      <USelect v-if="(me?.members.length ?? 0) > 1" v-model="assignee" :items="people" :placeholder="$t('transactionAssignReview')" :disabled="busy || !!demo" :aria-label="$t('transactionAssignReview')" class="w-44" />
      <DemoLock v-if="assignee" v-slot="{ locked }"><UButton color="neutral" variant="outline" :label="$t('transactionAssign')" :disabled="busy || locked" @click="apply({ assignedTo: assignee, reviewed: false })" /></DemoLock>
      <UButton color="neutral" variant="ghost" :label="$t('cancel')" :disabled="busy" @click="emit('clear')" />
    </div>
    <div v-if="undoToken" class="flex items-center gap-3 text-sm" :class="rows.length ? 'mt-3' : ''" role="status">
      <UIcon name="i-lucide-circle-check" class="size-4 text-success" aria-hidden="true" />
      <span>{{ $t('transactionBulkSaved') }}</span>
      <DemoLock v-slot="{ locked }"><UButton color="neutral" variant="link" :label="$t('transactionUndo')" :loading="busy" :disabled="locked" @click="undo" /></DemoLock>
    </div>
    <p v-if="error" role="alert" class="mt-2 text-sm text-error">{{ error }}</p>
  </div>
</template>
