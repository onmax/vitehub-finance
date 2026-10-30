<script setup lang="ts">
// Passkeys: sign in with the device's fingerprint, face, or PIN instead of a password.
interface Passkey {
  id: string
  name?: string | null
  createdAt: string | Date
  deviceType?: string
  backedUp?: boolean
}

const { $auth } = useNuxtApp()
const notify = useNotify()
const confirm = useConfirm()
const supported = typeof window !== "undefined" && "PublicKeyCredential" in window
// A passkey on a demo person would let one visitor lock out the rest; the server refuses registration there too.
const demo = useDemoPerson()

const { data: passkeys, status, error, refresh } = useAsyncData<Passkey[]>(
  "settings:passkeys",
  async () => {
    const { data, error: failure } = await $auth.passkey.listUserPasskeys()
    if (failure) throw Object.assign(new Error(failure.message || translate('couldnTLoadYourPasskeys')), { code: failure.code })
    return (data ?? []) as Passkey[]
  },
  { default: () => [], lazy: true },
)

const adding = ref(false)
const addError = ref("")
async function add() {
  if (demo.value) return
  adding.value = true
  addError.value = ""
  try {
    const name = deviceName()
    const result = await $auth.passkey.addPasskey({ name })
    if (result?.error) throw Object.assign(new Error(result.error.message || translate('couldnTAddThePasskey')), { code: "code" in result.error ? result.error.code : "PASSKEY_AUTH_FAILED" })
    await refresh()
    notify.success(translate('passkeyAdded'), translate('signInWithItOn', { value1: name }))
  } catch (cause) {
    addError.value = errorText(cause)
  } finally {
    adding.value = false
  }
}

async function remove(passkey: Passkey) {
  const { confirmed } = await confirm({
    title: translate('delete3', { value1: passkey.name || translate('passkey') }),
    get description() { return translate('youWonTBeAbleToSignInWithIt') },
    confirmLabel: translate('deletePasskey'),
    destructive: true,
  })
  if (!confirmed) return
  const { error: failure } = await $auth.passkey.deletePasskey({ id: passkey.id })
  if (failure) return notify.error(failure, translate('couldnTDeleteThePasskey'))
  await refresh()
}

/** "Chrome on macOS", to name a new passkey after the device that made it. */
function deviceName() {
  return describeAgent(navigator.userAgent)
}
</script>

<template>
  <SettingsSection :title="$t('passkeys')" :description="$t('signInWithYourFingerprintFaceOrDevicePinInstead')" flush>
    <template #actions>
      <DemoLock v-if="supported" v-slot="{ locked }">
        <UButton color="neutral" variant="outline" icon="i-lucide-plus" :label="$t('addPasskey')" :loading="adding" :disabled="locked" @click="add" />
      </DemoLock>
    </template>
    <div class="flex flex-col">
      <p v-if="addError" class="mx-4 mt-4 text-sm text-error sm:mx-5" role="alert">{{ addError }}</p>
      <p v-if="!supported" class="py-4 text-sm text-muted">{{ $t('thisBrowserCanTCreatePasskeys') }}</p>
      <div v-if="status === 'pending' && !passkeys.length" class="flex flex-col gap-3 py-4">
        <USkeleton class="h-5 w-48" />
        <USkeleton class="h-5 w-40" />
      </div>
      <div v-else-if="error" class="py-4"><PageError :error="error" @retry="refresh()" /></div>
      <p v-else-if="!passkeys.length" class="py-4 text-sm text-muted">{{ $t('noPasskeysYetAddOneToSignInWithoutTyping') }}</p>
      <ul v-else class="divide-y divide-default">
        <li v-for="passkey in passkeys" :key="passkey.id" class="flex min-h-14 items-center gap-3 py-2">
          <span class="grid size-8 shrink-0 place-items-center rounded-md bg-elevated text-muted">
            <UIcon name="i-lucide-key-round" class="size-4" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-highlighted">{{ passkey.name || $t('passkey') }}</p>
            <p class="text-xs text-muted tabular-nums"> {{ $t('added', { value1: formatDate(new Date(passkey.createdAt)) }) }}<template v-if="passkey.backedUp"> {{ $t('synced3') }}</template>
            </p>
          </div>
          <DemoLock v-slot="{ locked }">
            <UTooltip :text="$t('deletePasskey')" :disabled="locked">
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-trash-2"
                :aria-label="$t('delete4', { value1: passkey.name || $t('passkey') })"
                :disabled="locked"
                @click="remove(passkey)"
              />
            </UTooltip>
          </DemoLock>
        </li>
      </ul>
    </div>
  </SettingsSection>
</template>
