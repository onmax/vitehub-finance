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
    ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(fromMinor(props.budget.amountMinor, props.currency))
    : "",
  personal: props.budget ? props.budget.ownerId !== null : (props.personal ?? false),
})
const pending = ref(false)
const error = ref("")

function validate(values: typeof state) {
  const errors: Array<{ name: string; message: string }> = []
  if (!values.categoryId) errors.push({ name: "categoryId", message: "Pick a category." })
  const amount = parseAmount(values.amount)
  if (amount === null || amount <= 0) errors.push({ name: "amount", message: "Enter a monthly amount above zero." })
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
    error.value = errorText(cause, "Couldn’t save the budget. Try again.")
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UModal
    :title="budget ? 'Edit budget' : 'Add a budget'"
    description="A monthly limit for one category. Joxi counts what’s spent in it each month."
    @update:open="(open) => !open && emit('close')"
  >
    <template #body>
      <UForm id="budget-form" :state="state" :validate="validate" class="flex flex-col gap-4" @submit="submit">
        <UFormField label="Category" name="categoryId">
          <CategorySelect v-model="state.categoryId" :allow-none="false" :kinds="['expense']" placeholder="Pick a category" class="w-full" />
        </UFormField>
        <UFormField label="Per month" name="amount">
          <UInput v-model="state.amount" inputmode="decimal" placeholder="450" class="w-full" :ui="{ base: 'tabular-nums', trailing: 'pointer-events-none' }">
            <template #trailing><span class="text-xs text-muted">{{ currency }}</span></template>
          </UInput>
        </UFormField>
        <UFormField v-if="shared" name="personal">
          <USwitch
            v-model="state.personal"
            label="Just for me"
            :description="
              state.personal
                ? 'Counts only your own accounts. Only you see this budget.'
                : 'Counts every shared account. Everyone in the household sees it.'
            "
          />
        </UFormField>
        <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" label="Cancel" @click="emit('close')" />
        <UButton type="submit" form="budget-form" :label="budget ? 'Save' : 'Add budget'" :loading="pending" />
      </div>
    </template>
  </UModal>
</template>
