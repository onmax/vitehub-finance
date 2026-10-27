<script setup lang="ts">
import type { Budget } from "#shared/api"
import { fromMinor, parseAmount, toMinor } from "#shared/money"

// Add or edit a monthly budget for an expense category. Closes with the saved budget, or nothing when dismissed.
const props = defineProps<{ budget?: Budget; currency: string; personal?: boolean }>()
const emit = defineEmits<{ close: [budget?: Budget] }>()
const shared = useShared()
const { locale } = useMoney()

const state = reactive({
  categoryId: (props.budget?.categoryId ?? undefined) as string | null | undefined,
  amount: props.budget
    ? new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2, useGrouping: false }).format(fromMinor(props.budget.amountMinor, props.currency))
    : "",
  personal: props.budget ? props.budget.ownerId !== null : (props.personal ?? false),
})
const pending = ref(false)
const error = ref("")

function validate(values: typeof state) {
  const errors: Array<{ name: string; message: string }> = []
  if (!values.categoryId) errors.push({ name: "categoryId", message: translate('pickACategory') })
  const amount = parseAmount(values.amount)
  if (amount === null || amount <= 0) errors.push({ name: "amount", message: translate('enterAMonthlyAmountAboveZero') })
  return errors
}

async function submit() {
  pending.value = true
  error.value = ""
  const body = { categoryId: state.categoryId, amountMinor: toMinor(parseAmount(state.amount) ?? 0, props.currency), personal: state.personal }
  try {
    const saved = props.budget
      ? await $fetch<Budget>(`/api/budgets/${props.budget.id}`, { method: "PATCH", body })
      : await $fetch<Budget>("/api/budgets", { method: "POST", body })
    await refreshStems("budgets")
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
    :description="$t('aMonthlySpendingLimitForOneCategoryItStartsOver')"
    @update:open="(open) => !open && emit('close')"
  >
    <template #body>
      <UForm id="budget-form" :state="state" :validate="validate" class="flex flex-col gap-4" @submit="submit">
        <UFormField :label="$t('category')" name="categoryId">
          <CategorySelect v-model="state.categoryId" :allow-none="false" :kinds="['expense']" :placeholder="$t('pickACategory2')" class="w-full" />
        </UFormField>
        <UFormField :label="$t('perMonth')" name="amount">
          <UInput v-model="state.amount" inputmode="decimal" placeholder="450" class="w-full" :ui="{ base: 'tabular-nums', trailing: 'pointer-events-none' }">
            <template #trailing><span class="text-xs text-muted">{{ currency }}</span></template>
          </UInput>
        </UFormField>
        <UFormField v-if="shared" name="personal">
          <USwitch
            v-model="state.personal"
            :label="$t('justForMe')"
            :description="
              state.personal
                ? $t('countsOnlyYourOwnAccountsOnlyYouSeeThisBudget')
                : $t('countsEverySharedAccountEveryoneInTheHouseholdSeesIt')
            "
          />
        </UFormField>
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
