<script setup lang="ts">
import type { Transaction } from "#shared/api"
import { canEdit, canSeeTransaction } from "#shared/access"

const props = defineProps<{ transaction: Transaction }>()
const emit = defineEmits<{ saved: [transaction: Transaction] }>()
const { data: me } = useMe()
const { data: accounts } = useAccounts()
const busy = shallowRef(false)
const error = shallowRef("")
const account = computed(() => accounts.value.find((item) => item.id === props.transaction.accountId))
const people = computed(() => [
  { value: "__unassigned", label: translate('transactionUnassigned') },
  ...(me.value?.members ?? [])
    .filter((person) => account.value && canEdit(account.value, person.userId) && canSeeTransaction(account.value, props.transaction, person.userId))
    .map((person) => ({ value: person.userId, label: person.name })),
])
const reviewer = computed(() => me.value?.members.find((person) => person.userId === props.transaction.review?.reviewedBy)?.name)
async function save(body: { reviewed?: boolean; assignedTo?: string | null }) {
  busy.value = true
  error.value = ""
  try {
    emit("saved", await $fetch<Transaction>(`/api/transactions/${props.transaction.id}`, { method: "PATCH", body }))
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTChangeThat'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="rounded-lg border border-default p-3" :aria-label="$t('transactionReview')" :aria-busy="busy">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2 text-sm font-medium">
        <UIcon :name="transaction.review?.reviewedAt ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'" :class="transaction.review?.reviewedAt ? 'text-success' : 'text-muted'" aria-hidden="true" />
        {{ transaction.review?.reviewedAt ? $t('transactionReviewed') : $t('transactionNeedsReview') }}
      </div>
      <DemoLock v-if="transaction.canEdit" v-slot="{ locked }">
        <UButton size="sm" color="neutral" variant="outline" :label="transaction.review?.reviewedAt ? $t('transactionMarkUnreviewed') : $t('transactionMarkReviewed')" :loading="busy" :disabled="locked" @click="save({ reviewed: !transaction.review?.reviewedAt })" />
      </DemoLock>
    </div>
    <p v-if="transaction.review?.reviewedAt" class="mt-2 text-xs text-muted">{{ $t('transactionReviewedBy', { name: reviewer ?? $t('member'), date: formatDate(transaction.review.reviewedAt.slice(0, 10)) }) }}</p>
    <UFormField v-if="people.length > 2 || transaction.review?.assignedTo" :label="$t('transactionAssignReview')" class="mt-3">
      <DemoLock v-slot="{ locked }" block>
        <USelect :model-value="transaction.review?.assignedTo ?? '__unassigned'" :items="people" :disabled="!transaction.canEdit || busy || locked" class="w-full" @update:model-value="(value) => save({ assignedTo: value === '__unassigned' ? null : value, reviewed: false })" />
      </DemoLock>
    </UFormField>
    <p v-if="error" role="alert" class="mt-2 text-sm text-error">{{ error }}</p>
  </section>
</template>
