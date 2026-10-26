<script setup lang="ts">
import type { AccountKind, AccountSummary } from "#shared/api"
import { parseAmount, toMinor } from "#shared/money"

// A manual account: cash, a pension, a loan, or a bank ViteHub Finance can't reach. Opened through useOverlay; closes with the
// new account, or nothing when dismissed.
const props = defineProps<{ kind?: AccountKind }>()
const emit = defineEmits<{ close: [account?: AccountSummary] }>()
const { data: me } = useMe()
const shared = useShared()

const state = reactive({
  name: "",
  kind: props.kind ?? ("checking" as AccountKind),
  currency: me.value?.household.currency ?? "EUR",
  balance: "",
  institution: "",
  visibility: (me.value?.household.shareNewAccounts === false ? "private" : "household") as "private" | "household",
})
const pending = ref(false)
const error = ref("")

function validate(values: typeof state) {
  const errors: Array<{ name: string; message: string }> = []
  if (!values.name.trim()) errors.push({ name: "name", message: "Give the account a name." })
  if (values.balance.trim() && parseAmount(values.balance) === null) errors.push({ name: "balance", message: "Enter an amount like 1.234,56." })
  return errors
}

async function submit() {
  pending.value = true
  error.value = ""
  try {
    const account = await $fetch<AccountSummary>("/api/accounts", {
      method: "POST",
      body: {
        name: state.name.trim(),
        kind: state.kind,
        currency: state.currency,
        balanceMinor: toMinor(parseAmount(state.balance) ?? 0, state.currency),
        visibility: state.visibility,
        institution: state.institution.trim() || undefined,
      },
    })
    await refreshStems("accounts", "overview")
    emit("close", account)
  } catch (cause) {
    error.value = errorText(cause, "Couldn’t add the account. Try again.")
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UModal title="Add a manual account" description="For cash, a pension, a loan, or a bank ViteHub Finance can’t connect to. You update its balance yourself." @update:open="(open) => !open && emit('close')">
    <template #body>
      <UForm id="account-create" :state="state" :validate="validate" class="flex flex-col gap-4" @submit="submit">
        <UFormField label="Name" name="name">
          <UInput v-model="state.name" placeholder="Cash, Pension plan…" class="w-full" autofocus />
        </UFormField>
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Kind" name="kind">
            <USelect v-model="state.kind" :items="ACCOUNT_KIND_ITEMS" class="w-full" />
          </UFormField>
          <UFormField label="Currency" name="currency">
            <USelect v-model="state.currency" :items="CURRENCIES" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Current balance" name="balance" hint="Optional" help="Negative for what you owe, like −1.200,00 on a loan.">
          <UInput v-model="state.balance" inputmode="decimal" placeholder="0,00" class="w-full" :ui="{ base: 'tabular-nums' }" />
        </UFormField>
        <UFormField label="Bank or provider" name="institution" hint="Optional">
          <UInput v-model="state.institution" placeholder="Openbank, MyInvestor…" class="w-full" />
        </UFormField>
        <UFormField v-if="shared" label="Who sees it" name="visibility">
          <URadioGroup
            v-model="state.visibility"
            :items="[
              { value: 'household', label: 'Shared', description: 'Everyone in the household sees it and its transactions.' },
              { value: 'private', label: 'Private', description: 'Only you see it. It stays out of the household’s totals.' },
            ]"
          />
        </UFormField>
        <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" label="Cancel" @click="emit('close')" />
        <UButton type="submit" form="account-create" label="Add account" :loading="pending" />
      </div>
    </template>
  </UModal>
</template>
