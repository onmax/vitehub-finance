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
  if (!values.name.trim()) errors.push({ name: "name", message: translate('giveTheAccountAName') })
  if (values.balance.trim() && parseAmount(values.balance) === null) errors.push({ name: "balance", message: translate('enterAnAmountLike123456') })
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
    error.value = errorText(cause, translate('couldnTAddTheAccountTryAgain'))
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UModal :title="$t('addAManualAccount')" :description="$t('forCashAPensionALoanOrABankYou')" @update:open="(open) => !open && emit('close')">
    <template #body>
      <UForm id="account-create" :state="state" :validate="validate" class="flex flex-col gap-4" @submit="submit">
        <UFormField :label="$t('name')" name="name">
          <UInput v-model="state.name" :placeholder="$t('cashPensionPlan')" class="w-full" autofocus />
        </UFormField>
        <div class="grid grid-cols-2 gap-3">
          <UFormField :label="$t('kind')" name="kind">
            <USelect v-model="state.kind" :items="ACCOUNT_KIND_ITEMS" class="w-full" />
          </UFormField>
          <UFormField :label="$t('currency')" name="currency">
            <USelect v-model="state.currency" :items="CURRENCIES" class="w-full" />
          </UFormField>
        </div>
        <UFormField :label="$t('currentBalance')" name="balance" :hint="$t('optionalHint')" :help="$t('negativeForWhatYouOweLike120000On')">
          <UInput v-model="state.balance" inputmode="decimal" :placeholder="$t('amountZeroPlaceholder')" class="w-full" :ui="{ base: 'tabular-nums' }" />
        </UFormField>
        <UFormField :label="$t('bankOrProvider')" name="institution" :hint="$t('optionalHint')">
          <UInput v-model="state.institution" :placeholder="$t('openbankMyinvestor')" class="w-full" />
        </UFormField>
        <UFormField v-if="shared" :label="$t('whoSeesIt')" name="visibility">
          <URadioGroup
            v-model="state.visibility"
            :items="[
              { value: 'household', label: $t('shared'), description: $t('everyoneInTheHouseholdSeesItAndItsTransactions') },
              { value: 'private', label: $t('private'), description: $t('onlyYouSeeItItStaysOutOfTheHousehold') },
            ]"
          />
        </UFormField>
        <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="$t('cancel')" @click="emit('close')" />
        <DemoLock v-slot="{ locked }">
          <UButton type="submit" form="account-create" :label="$t('addAccount')" :loading="pending" :disabled="locked" />
        </DemoLock>
      </div>
    </template>
  </UModal>
</template>
