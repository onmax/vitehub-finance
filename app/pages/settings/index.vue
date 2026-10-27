<script setup lang="ts">
// Profile: the name your household sees, your email, and the theme on this device.
useHead({ get title() { return translate('profile') } })
const { $auth } = useNuxtApp()
const { data: me, refresh } = useMe()
const session = useAuthSession()
const notify = useNotify()
const colorMode = useColorMode()

const state = reactive({ name: "" })
watchEffect(() => {
  if (!state.name && me.value) state.name = me.value.user.name
})
const pending = ref(false)
// The demo's people keep their names for every visitor (Better Auth's /update-user is off there).
const demo = useDemoPerson()
const error = ref("")
const dirty = computed(() => Boolean(me.value) && state.name.trim() !== me.value?.user.name)

function validate(values: typeof state) {
  return values.name.trim() ? [] : [{ name: "name", message: translate('enterTheNameYourHouseholdShouldSee') }]
}

async function save() {
  if (demo.value) return
  pending.value = true
  error.value = ""
  try {
    const { error: failure } = await $auth.updateUser({ name: state.name.trim() })
    if (failure) throw Object.assign(new Error(failure.message || translate('couldnTSaveYourName')), { code: failure.code })
    await Promise.all([refresh(), session.refresh()])
    notify.success(translate('nameSaved'))
  } catch (cause) {
    error.value = errorText(cause)
  } finally {
    pending.value = false
  }
}

const themes = [
  { value: "light", get label() { return translate('light') }, iconName: "i-lucide-sun" },
  { value: "dark", get label() { return translate('dark') }, iconName: "i-lucide-moon" },
  { value: "system", get label() { return translate('system') }, iconName: "i-lucide-monitor" },
]
const theme = computed({
  get: () => colorMode.preference,
  set: (value: string) => (colorMode.preference = value),
})
</script>

<template>
  <UForm :state="state" :validate="validate" @submit="save">
    <SettingsSection :title="$t('profile')" :description="$t('yourNameShowsNextToYourAccountsAndTransactionsIn')">
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <UAvatar :alt="me?.user.name ?? $t('you')" :src="me?.user.image ?? undefined" size="lg" class="rounded-lg" />
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-highlighted">{{ me?.user.name ?? "…" }}</p>
            <p class="truncate text-sm text-muted">{{ me?.household.name }}</p>
          </div>
        </div>
        <UFormField :label="$t('name')" name="name" class="max-w-sm">
          <USkeleton v-if="!me" class="h-9 w-full" />
          <UInput v-else v-model="state.name" autocomplete="name" class="w-full" :disabled="demo" />
        </UFormField>
        <UFormField :label="$t('email')" name="email" :help="$t('youSignInWithItToUseAnotherEmailCreate')" class="max-w-sm">
          <UInput :model-value="me?.user.email ?? ''" disabled class="w-full" />
        </UFormField>
        <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
      </div>
      <template #footer>
        <DemoLock v-slot="{ locked }">
          <UButton type="submit" :label="$t('save')" :loading="pending" :disabled="locked || !dirty" />
        </DemoLock>
      </template>
    </SettingsSection>
  </UForm>

  <SettingsSection :title="$t('language')" :description="$t('languageHelp')">
    <LanguagePicker />
  </SettingsSection>

  <SettingsSection :title="$t('currency')" :description="$t('displayCurrencyHelp')">
    <CurrencyPicker />
  </SettingsSection>

  <SettingsSection :title="$t('theme')" :description="$t('appliesToThisDeviceOnly')">
    <URadioGroup
      v-model="theme"
      :items="themes"
      orientation="horizontal"
      variant="card"
      indicator="hidden"
      :aria-label="$t('theme')"
      :ui="{ fieldset: 'grid grid-cols-3 gap-2', item: 'justify-center has-data-[state=checked]:border-primary' }"
    >
      <template #label="{ item }">
        <span class="flex items-center gap-2"><UIcon :name="item.iconName" class="size-4 text-muted" />{{ item.label }}</span>
      </template>
    </URadioGroup>
  </SettingsSection>
</template>
