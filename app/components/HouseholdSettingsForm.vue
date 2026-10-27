<script setup lang="ts">
// The household's name, the currency totals are shown in, whether new accounts start shared, and AI categories (when
// the server has them). Only the owner changes them.
const { data: me, refresh } = useMe()
const notify = useNotify()
const isOwner = computed(() => me.value?.role === "owner")
const state = reactive({ name: "", currency: "EUR", shareNewAccounts: true, aiCategorize: true })
watch(
  () => me.value?.household,
  (household) =>
    household &&
    Object.assign(state, {
      name: household.name,
      currency: household.currency,
      shareNewAccounts: household.shareNewAccounts,
      aiCategorize: household.aiCategorize,
    }),
  { immediate: true },
)
const dirty = computed(
  () =>
    !!me.value &&
    (state.name.trim() !== me.value.household.name ||
      state.currency !== me.value.household.currency ||
      state.shareNewAccounts !== me.value.household.shareNewAccounts ||
      state.aiCategorize !== me.value.household.aiCategorize),
)
const saving = ref(false)
// The demo household keeps its name and currency for every visitor (the server refuses the change too).
const demo = useDemoPerson()
const error = ref("")

const validate = (values: typeof state) => (values.name.trim() ? [] : [{ name: "name", message: translate('giveTheHouseholdAName') }])

async function save() {
  saving.value = true
  error.value = ""
  try {
    await $fetch("/api/household", {
      method: "PATCH",
      body: {
        name: state.name.trim(),
        currency: state.currency,
        shareNewAccounts: state.shareNewAccounts,
        ...(me.value?.ai ? { aiCategorize: state.aiCategorize } : {}),
      },
    })
    const currencyChanged = state.currency !== me.value?.household.currency
    await refresh()
    if (currencyChanged) await refreshNuxtData()
    notify.success(translate('householdSaved'))
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTSaveTryAgain'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UForm :state="state" :validate="validate" :disabled="!isOwner || demo" @submit="save">
    <SettingsSection :title="$t('household')" :description="demo ? demoLocked() : isOwner ? undefined : $t('onlyTheHouseholdSOwnerChangesThese')">
      <div class="flex flex-col gap-5">
        <div class="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <UFormField :label="$t('name')" name="name">
            <UInput v-model="state.name" class="w-full" />
          </UFormField>
          <UFormField :label="$t('currency')" name="currency" :help="$t('totalsAndChartsUseIt')">
            <USelect v-model="state.currency" :items="CURRENCIES" class="w-full" />
          </UFormField>
        </div>
        <USwitch
          v-model="state.shareNewAccounts"
          :label="$t('shareNewAccountsByDefault')"
          :description="$t('accountsAnyoneConnectsStartVisibleToTheWholeHouseholdEach')"
        />
        <USwitch
          v-if="me?.ai"
          v-model="state.aiCategorize"
          :label="$t('suggestCategoriesWithAi')"
          :description="$t('whenNoRuleMatchesATransactionTypesafeSJevModel')"
        />
      </div>
      <template v-if="isOwner" #footer>
        <p v-if="error" class="mr-auto text-sm text-error" role="alert">{{ error }}</p>
        <DemoLock v-slot="{ locked }">
          <UButton type="submit" color="neutral" variant="outline" :label="$t('save')" :loading="saving" :disabled="locked || !dirty" />
        </DemoLock>
      </template>
    </SettingsSection>
  </UForm>
</template>
