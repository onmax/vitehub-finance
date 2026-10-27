<script setup lang="ts">
// Change the password, optionally signing out every other device.
const { $auth } = useNuxtApp()
const notify = useNotify()
const state = reactive({ current: "", next: "", signOutOthers: true })
const pending = ref(false)
// The demo's people share one sign-in among every visitor, so its password never changes (the server refuses too).
const demo = useDemoPerson()
const error = ref("")
const form = useTemplateRef("form")

function validate(values: typeof state) {
  const errors: Array<{ name: string; message: string }> = []
  if (!values.current) errors.push({ name: "current", message: translate('enterYourCurrentPassword') })
  if (values.next.length < 10) errors.push({ name: "next", message: translate('useAtLeast10Characters') })
  return errors
}

async function submit() {
  if (demo.value) return
  pending.value = true
  error.value = ""
  try {
    const { error: failure } = await $auth.changePassword({
      currentPassword: state.current,
      newPassword: state.next,
      revokeOtherSessions: state.signOutOthers,
    })
    if (failure) throw Object.assign(new Error(failure.message || translate('couldnTChangeThePassword')), { code: failure.code })
    state.current = ""
    state.next = ""
    form.value?.clear()
    notify.success(translate('passwordChanged'), state.signOutOthers ? translate('yourOtherDevicesAreSignedOut') : undefined)
  } catch (cause) {
    error.value = errorText(cause)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UForm ref="form" :state="state" :validate="validate" :validate-on="['blur']" :disabled="demo" @submit="submit">
    <SettingsSection :title="$t('password')" :description="demo ? demoLocked() : $t('useAtLeast10CharactersAPasskeyIsQuickerAnd')">
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="$t('currentPassword')" name="current">
          <UInput v-model="state.current" type="password" autocomplete="current-password" class="w-full" />
        </UFormField>
        <UFormField :label="$t('newPassword')" name="next">
          <UInput v-model="state.next" type="password" autocomplete="new-password" class="w-full" />
        </UFormField>
        <UCheckbox v-model="state.signOutOthers" :label="$t('signOutOfEveryOtherDevice')" class="sm:col-span-2" />
        <p v-if="error" class="text-sm text-error sm:col-span-2" role="alert">{{ error }}</p>
      </div>
      <template #footer>
        <DemoLock v-slot="{ locked }">
          <UButton type="submit" color="neutral" variant="outline" :label="$t('changePassword')" :loading="pending" :disabled="locked" />
        </DemoLock>
      </template>
    </SettingsSection>
  </UForm>
</template>
