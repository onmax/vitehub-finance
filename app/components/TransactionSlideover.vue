<script setup lang="ts">
import type { Transaction } from "#shared/api"

// One transaction's details: category, a note (saved as you pause typing or leave the field), whether it counts in
// totals, whether the rest of the household sees it (the account's owner decides), and where it came from. View-only
// accounts show the same, without the controls.
const props = defineProps<{ transaction: Transaction | null }>()
const open = defineModel<boolean>("open", { default: false })
const emit = defineEmits<{ saved: [transaction: Transaction]; category: [transaction: Transaction, categoryId: string | null] }>()

const notify = useNotify()
const { find } = useCategories()
const shared = useShared()
const { data: me } = useMe()
const note = ref("")
const savingNote = ref<"idle" | "saving" | "saved">("idle")
const noteError = ref("")
const excluding = ref(false)
const hiding = ref(false)
watch(
  () => props.transaction?.id,
  () => {
    note.value = props.transaction?.note ?? ""
    savingNote.value = "idle"
    noteError.value = ""
  },
  { immediate: true },
)

async function patch(body: Record<string, unknown>) {
  const saved = await $fetch<Transaction>(`/api/transactions/${props.transaction!.id}`, { method: "PATCH", body })
  emit("saved", saved)
  return saved
}

async function saveNote() {
  if (!props.transaction || (note.value.trim() || null) === (props.transaction.note ?? null)) return
  savingNote.value = "saving"
  noteError.value = ""
  try {
    await patch({ note: note.value.trim() || null })
    savingNote.value = "saved"
  } catch (error) {
    savingNote.value = "idle"
    noteError.value = errorText(error, translate('couldnTSaveTheNoteTryAgain'))
  }
}
const saveNoteSoon = useDebounceFn(saveNote, 800)

async function setExcluded(value: boolean) {
  if (!props.transaction) return
  excluding.value = true
  try {
    await patch({ excluded: value })
    await refreshStems("overview", "budgets", "recurring", "forecast")
  } catch (error) {
    notify.error(error, translate('couldnTChangeThat'))
  } finally {
    excluding.value = false
  }
}

async function setHidden(value: boolean) {
  if (!props.transaction) return
  hiding.value = true
  try {
    await patch({ hidden: value })
    await refreshStems("overview", "budgets", "recurring", "forecast")
  } catch (error) {
    notify.error(error, translate('couldnTChangeThat'))
  } finally {
    hiding.value = false
  }
}

const title = computed(() => props.transaction?.counterparty || props.transaction?.description || translate('transaction'))
const category = computed(() => find(props.transaction?.categoryId))
// AI's pick for an uncategorized row it wasn't sure about: offered here, one click to use it, never in the lists.
const guess = computed(() => (props.transaction && !props.transaction.categoryId ? find(props.transaction.aiGuessId) : undefined))
</script>

<template>
  <USlideover v-model:open="open" :title="title" :description="transaction ? formatDate(transaction.date) : undefined" :ui="{ body: 'flex flex-col gap-6' }">
    <template v-if="transaction" #body>
      <div class="flex items-center gap-3">
        <Monogram :name="title" />
        <Money :minor="transaction.amountMinor" :currency="transaction.currency" tone="in" original="below" align="start" class="text-2xl font-semibold tracking-[-0.02em] text-highlighted" :class="transaction.excluded && 'line-through'" />
        <UBadge v-if="transaction.status === 'pending'" color="neutral" variant="outline" :label="$t('pending')" />
        <UBadge v-if="transaction.hidden" color="neutral" variant="outline" icon="i-lucide-lock" :label="$t('onlyYou')" />
      </div>

      <p v-if="transaction.transferWith" class="flex gap-2 rounded-lg bg-elevated p-3 text-sm text-pretty text-muted">
        <UIcon name="i-lucide-arrow-left-right" class="mt-0.5 size-4 shrink-0" />
        <span> {{ $t('moved', { value1: transaction.amountMinor < 0 ? "to" : "from" }) }} <span class="font-medium text-highlighted">{{ transaction.transferWith }}</span>{{ $t('soItIsnTSpendingOrIncomePickAnotherCategory') }} </span>
      </p>

      <UFormField :label="$t('category')">
        <CategorySelect
          v-if="transaction.canEdit"
          :model-value="transaction.categoryId"
          class="w-full"
          @update:model-value="(value) => emit('category', transaction!, value ?? null)"
        />
        <p v-else class="flex items-center gap-2 text-sm">
          <CategoryIcon :icon="category?.icon" :color="category?.color" size="sm" />{{ category?.name ?? $t('uncategorized') }}
        </p>
        <div v-if="guess && transaction.canEdit" class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted">
          <UIcon name="i-lucide-sparkles" class="size-3.5 shrink-0" aria-hidden="true" />
          <span>{{ $t('aiGuess') }}</span>
          <UButton color="neutral" variant="outline" size="xs" :icon="guess.icon" :label="$t('useCategory', { category: guess.name })" @click="emit('category', transaction!, guess.id)" />
        </div>
        <p v-if="transaction.categorySource === 'ai'" class="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <UIcon name="i-lucide-sparkles" class="size-3.5 shrink-0" /> {{ $t('suggestedByAiFromTheDescription', { value1: transaction.canEdit ? $t('pickAnotherIfWrong') : "" }) }}
        </p>
      </UFormField>

      <UFormField :label="$t('note')" :error="noteError || undefined" :hint="savingNote === 'saving' ? $t('saving') : savingNote === 'saved' ? $t('saved2') : undefined">
        <UTextarea
          v-model="note"
          :disabled="!transaction.canEdit"
          :placeholder="$t('addANoteWhatItWasForWhoPaid')"
          :rows="3"
          autoresize
          class="w-full"
          @update:model-value="saveNoteSoon"
          @blur="saveNote"
        />
      </UFormField>

      <USwitch
        :model-value="transaction.excluded"
        :disabled="!transaction.canEdit"
        :loading="excluding"
        :label="$t('leaveOutOfTotals')"
        :description="$t('forDuplicatesTheBankSentItStaysInTheList')"
        @update:model-value="setExcluded"
      />

      <USwitch
        v-if="transaction.canHide && shared"
        :model-value="transaction.hidden"
        :loading="hiding"
        :label="$t('onlyMe')"
        :description="$t('othersInWonTSeeItInListsTotalsOr', { value1: me?.household.name ?? $t('yourHousehold') })"
        @update:model-value="setHidden"
      />

      <p v-if="!transaction.canEdit" class="flex gap-2 rounded-lg bg-elevated p-3 text-sm text-muted">
        <UIcon name="i-lucide-lock" class="mt-0.5 size-4 shrink-0" /> {{ $t('sharesThisAccountViewOnlySoOnlyTheyCanChange', { value1: transaction.ownerName }) }} </p>

      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 border-t border-default pt-4 text-sm">
        <dt class="text-muted">{{ $t('account') }}</dt>
        <dd class="min-w-0 truncate text-right">
          <NuxtLink :to="`/accounts/${transaction.accountId}`" class="text-highlighted underline-offset-2 hover:underline">{{ transaction.accountName }}</NuxtLink>
        </dd>
        <template v-if="shared">
          <dt class="text-muted">{{ $t('owner') }}</dt>
          <dd class="flex items-center justify-end gap-2"><OwnerAvatar :name="transaction.ownerName" :user-id="transaction.ownerId" size="3xs" />{{ transaction.ownerName }}</dd>
        </template>
        <dt class="text-muted">{{ $t('date') }}</dt>
        <dd class="money text-right">{{ formatDate(transaction.date) }}</dd>
        <dt class="text-muted">{{ $t('status') }}</dt>
        <dd class="text-right">{{ transaction.status === "pending" ? $t('pendingAtTheBank') : $t('booked') }}</dd>
        <template v-if="transaction.counterparty">
          <dt class="text-muted">{{ $t('counterparty') }}</dt>
          <dd class="text-right break-words">{{ transaction.counterparty }}</dd>
        </template>
        <dt class="text-muted">{{ $t('bankDescription') }}</dt>
        <dd class="text-right font-mono text-xs break-all text-toned">{{ transaction.description }}</dd>
      </dl>
    </template>
  </USlideover>
</template>
