<script setup lang="ts">
import type { Budget, BudgetSuggestion, BudgetsResponse } from "#shared/api"
import { fromMinor, parseAmount, toMinor } from "#shared/money"

const props = defineProps<{
  budget?: Budget
  currency: string
  personal?: boolean
  month?: string
  suggestions?: BudgetsResponse["suggestions"]
  suggestion?: BudgetSuggestion
}>()
const emit = defineEmits<{ close: [budget?: Budget] }>()
const shared = useShared()
const { locale, format } = useMoney()
const amountText = (minor: number) => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 3, useGrouping: false }).format(fromMinor(minor, props.currency))
const state = reactive<{ categoryId: string | null | undefined; amount: string; personal: boolean; effectiveMonth: string; carryEnabled: boolean }>({
  categoryId: props.budget?.categoryId ?? props.suggestion?.categoryId,
  amount: props.budget ? amountText(props.budget.amountMinor) : props.suggestion ? amountText(props.suggestion.amountMinor) : "",
  personal: props.budget ? props.budget.ownerId !== null : (props.personal ?? false),
  effectiveMonth: props.month && props.month >= currentMonth() ? props.month : currentMonth(),
  carryEnabled: props.budget?.carryEnabled ?? false,
})
const suggestion = computed(() => props.suggestions?.[state.personal ? "personal" : "household"].find((item) => item.categoryId === state.categoryId))
const pending = ref(false)
const error = ref("")

function validate(values: typeof state) {
  const errors: Array<{ name: string; message: string }> = []
  if (!values.categoryId) errors.push({ name: "categoryId", message: translate('pickACategory') })
  const amount = parseAmount(values.amount)
  if (amount === null || amount <= 0) errors.push({ name: "amount", message: translate('enterAMonthlyAmountAboveZero') })
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(values.effectiveMonth) || values.effectiveMonth < currentMonth())
    errors.push({ name: "effectiveMonth", message: translate('budgetMonthMustBeCurrentOrFuture') })
  return errors
}

async function submit() {
  if (!state.categoryId) return
  pending.value = true
  error.value = ""
  const body = {
    categoryId: state.categoryId,
    amountMinor: toMinor(parseAmount(state.amount) ?? 0, props.currency),
    personal: state.personal,
    effectiveMonth: state.effectiveMonth,
    carryEnabled: state.carryEnabled,
  }
  try {
    const saved = props.budget
      ? await $fetch<Budget>(`/api/budgets/${props.budget.id}`, { method: "PATCH", body })
      : await $fetch<Budget>("/api/budgets", { method: "POST", body })
    await refreshStems("budgets", "forecast", "setup")
    emit("close", saved)
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTSaveTheBudgetTryAgain'))
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UModal
    :title="budget ? $t('editBudget') : $t('addABudget')"
    :description="$t('budgetPlanningDescription')"
    @update:open="(open) => !open && emit('close')"
  >
    <template #body>
      <UForm id="budget-form" :state="state" :validate="validate" class="flex flex-col gap-4" @submit="submit">
        <UFormField :label="$t('category')" name="categoryId" required>
          <CategorySelect v-model="state.categoryId" :disabled="!!budget" :allow-none="false" :kinds="['expense']" :placeholder="$t('pickACategory2')" class="w-full" />
        </UFormField>
        <UFormField :label="$t('perMonth')" name="amount" required>
          <UInput v-model="state.amount" inputmode="decimal" placeholder="450" class="w-full" :ui="{ base: 'tabular-nums', trailing: 'pointer-events-none' }">
            <template #trailing><span class="text-xs text-muted">{{ currency }}</span></template>
          </UInput>
        </UFormField>
        <div v-if="suggestion" class="rounded-lg border border-default bg-muted/30 p-3 text-sm">
          <p>{{ $t('budgetSuggestedAverage', { amount: format(suggestion.amountMinor, currency), count: suggestion.sampleMonths.length }, suggestion.sampleMonths.length) }}</p>
          <p class="mt-1 text-xs text-muted">{{ suggestion.sampleMonths.map((month) => formatMonth(month)).join(', ') }}</p>
          <UButton class="mt-2" color="neutral" variant="outline" size="sm" :label="$t('budgetUseAverage')" @click="state.amount = amountText(suggestion.amountMinor)" />
        </div>
        <p v-else-if="state.categoryId" class="text-xs text-muted">{{ $t('budgetNoHistorySuggestion') }}</p>
        <UFormField :label="$t('budgetAppliesFrom')" :description="$t('budgetHistoryKept')" name="effectiveMonth" required>
          <UInput v-model="state.effectiveMonth" type="month" :min="currentMonth()" class="w-full" />
        </UFormField>
        <p v-if="budget?.nextChangeMonth && budget.nextChangeMonth > state.effectiveMonth" class="text-sm text-muted">{{ $t('budgetNextScheduledChange', { month: formatMonth(budget.nextChangeMonth) }) }}</p>
        <UFormField name="carryEnabled">
          <USwitch v-model="state.carryEnabled" :label="$t('budgetCarryUnused')" :description="$t('budgetCarryDescription')" />
        </UFormField>
        <UFormField v-if="shared" name="personal">
          <USwitch
            v-model="state.personal"
            :disabled="!!budget"
            :label="$t('justForMe')"
            :description="state.personal ? $t('countsOnlyYourOwnAccountsOnlyYouSeeThisBudget') : $t('countsEverySharedAccountEveryoneInTheHouseholdSeesIt')"
          />
        </UFormField>
        <p v-if="budget" class="text-xs text-muted">{{ $t('budgetCategorySharingFixed') }}</p>
        <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="$t('cancel')" @click="emit('close')" />
        <DemoLock v-slot="{ locked }">
          <UButton type="submit" form="budget-form" :label="budget ? $t('save') : $t('addBudget')" :loading="pending" :disabled="locked" />
        </DemoLock>
      </div>
    </template>
  </UModal>
</template>
