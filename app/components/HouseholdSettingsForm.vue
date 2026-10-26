<script setup lang="ts">
// The household's name, the currency totals are shown in, and whether new accounts start shared. Only the owner
// changes them.
const { data: me, refresh } = useMe()
const notify = useNotify()
const isOwner = computed(() => me.value?.role === "owner")
const state = reactive({ name: "", currency: "EUR", shareNewAccounts: true })
watch(
  () => me.value?.household,
  (household) => household && Object.assign(state, { name: household.name, currency: household.currency, shareNewAccounts: household.shareNewAccounts }),
  { immediate: true },
)
const dirty = computed(
  () =>
    !!me.value &&
    (state.name.trim() !== me.value.household.name ||
      state.currency !== me.value.household.currency ||
      state.shareNewAccounts !== me.value.household.shareNewAccounts),
)
const saving = ref(false)
// The demo household keeps its name and currency for every visitor (the server refuses the change too).
const demo = useDemo()
const error = ref("")

const validate = (values: typeof state) => (values.name.trim() ? [] : [{ name: "name", message: "Give the household a name." }])

async function save() {
  saving.value = true
  error.value = ""
  try {
    await $fetch("/api/household", {
      method: "PATCH",
      body: { name: state.name.trim(), currency: state.currency, shareNewAccounts: state.shareNewAccounts },
    })
    const currencyChanged = state.currency !== me.value?.household.currency
    await refresh()
    if (currencyChanged) await refreshNuxtData()
    notify.success("Household saved")
  } catch (cause) {
    error.value = errorText(cause, "Couldn’t save. Try again.")
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UForm :state="state" :validate="validate" :disabled="!isOwner || demo" @submit="save">
    <SettingsSection title="Household" :description="demo ? DEMO_LOCKED : isOwner ? undefined : 'Only the household’s owner changes these.'">
      <div class="flex flex-col gap-5">
        <div class="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <UFormField label="Name" name="name">
            <UInput v-model="state.name" class="w-full" />
          </UFormField>
          <UFormField label="Currency" name="currency" help="Totals and charts use it.">
            <USelect v-model="state.currency" :items="CURRENCIES" class="w-full" />
          </UFormField>
        </div>
        <USwitch
          v-model="state.shareNewAccounts"
          label="Share new accounts by default"
          description="Accounts anyone connects start visible to the whole household. Each owner can still make theirs private."
        />
      </div>
      <template v-if="isOwner" #footer>
        <p v-if="error" class="mr-auto text-sm text-error" role="alert">{{ error }}</p>
        <DemoLock v-slot="{ locked }">
          <UButton type="submit" color="neutral" variant="outline" label="Save" :loading="saving" :disabled="locked || !dirty" />
        </DemoLock>
      </template>
    </SettingsSection>
  </UForm>
</template>
