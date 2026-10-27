<script setup lang="ts">
// Deleting your account: your sign-in, and your household with everything in it (server/auth.ts `deleteUser`). It waits
// until nobody else is in the household, so nobody loses shared accounts by surprise. Better Auth asks for a sign-in
// from the last day.
const { $auth } = useNuxtApp()
const { data: me } = useMe()
const session = useAuthSession()
const confirm = useConfirm()
const notify = useNotify()
const shared = useShared()
const demo = useDemoPerson()
const pending = ref(false)
const error = ref("")

async function remove() {
  const { confirmed } = await confirm({
    title: translate('deleteYourAccount'),
    get description() { return translate('deleteAccountConfirm', { household: me.value?.household.name ?? "" }) },
    confirmLabel: translate('deleteAccount'),
    destructive: true,
  })
  if (!confirmed) return
  pending.value = true
  error.value = ""
  try {
    const { error: failure } = await $auth.deleteUser({})
    if (failure) throw Object.assign(new Error(failure.message || translate('couldnTDeleteTheAccount')), { code: failure.code })
    await session.refresh()
    clearNuxtData()
    notify.success(translate('accountDeleted'))
    await navigateTo("/login")
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTDeleteTheAccount'))
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <SettingsSection :title="$t('deleteAccount')" :description="demo ? demoLocked() : $t('deleteAccountHelp')">
    <p v-if="shared && !demo" class="flex gap-2 text-sm text-muted">
      <UIcon name="i-lucide-users" class="mt-0.5 size-4 shrink-0" />
      <span>{{ $t('othersShareYourHouseholdLeaveItFirst') }} <ULink to="/household" class="font-medium text-highlighted underline underline-offset-4">{{ $t('household') }}</ULink></span>
    </p>
    <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
    <template #footer>
      <DemoLock v-slot="{ locked }">
        <UButton color="error" variant="outline" icon="i-lucide-trash-2" :label="$t('deleteAccount')" :loading="pending" :disabled="locked || shared" @click="remove" />
      </DemoLock>
    </template>
  </SettingsSection>
</template>
