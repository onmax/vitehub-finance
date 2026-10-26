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

const { data: passkeys, status, error, refresh } = useAsyncData<Passkey[]>(
  "settings:passkeys",
  async () => {
    const { data, error: failure } = await $auth.passkey.listUserPasskeys()
    if (failure) throw new Error(failure.message || "Couldn’t load your passkeys.")
    return (data ?? []) as Passkey[]
  },
  { default: () => [], lazy: true },
)

const adding = ref(false)
const addError = ref("")
async function add() {
  adding.value = true
  addError.value = ""
  try {
    const name = deviceName()
    const result = await $auth.passkey.addPasskey({ name })
    if (result?.error) throw new Error(result.error.message || "Couldn’t add the passkey.")
    await refresh()
    notify.success("Passkey added", `Sign in with it on ${name}.`)
  } catch (cause) {
    addError.value = errorText(cause)
  } finally {
    adding.value = false
  }
}

async function remove(passkey: Passkey) {
  const { confirmed } = await confirm({
    title: `Delete “${passkey.name || "Passkey"}”?`,
    description: "You won’t be able to sign in with it any more. Your password and other passkeys keep working.",
    confirmLabel: "Delete passkey",
    destructive: true,
  })
  if (!confirmed) return
  const { error: failure } = await $auth.passkey.deletePasskey({ id: passkey.id })
  if (failure) return notify.error(failure, "Couldn’t delete the passkey")
  await refresh()
}

/** "Chrome on macOS", to name a new passkey after the device that made it. */
function deviceName() {
  return describeAgent(navigator.userAgent)
}
</script>

<template>
  <SettingsSection title="Passkeys" description="Sign in with your fingerprint, face, or device PIN instead of a password." flush>
    <template #actions>
      <UButton
        v-if="supported"
        color="neutral"
        variant="outline"
        icon="i-lucide-plus"
        label="Add passkey"
        :loading="adding"
        @click="add"
      />
    </template>
    <div class="flex flex-col">
      <p v-if="addError" class="mx-4 mt-4 text-sm text-error sm:mx-5" role="alert">{{ addError }}</p>
      <p v-if="!supported" class="p-4 text-sm text-muted sm:px-5">This browser can’t create passkeys.</p>
      <div v-if="status === 'pending' && !passkeys.length" class="flex flex-col gap-3 p-4 sm:px-5">
        <USkeleton class="h-5 w-48" />
        <USkeleton class="h-5 w-40" />
      </div>
      <div v-else-if="error" class="p-4 sm:px-5"><PageError :error="error" @retry="refresh()" /></div>
      <p v-else-if="!passkeys.length" class="p-4 text-sm text-muted sm:px-5">No passkeys yet. Add one to sign in without typing a password.</p>
      <ul v-else class="divide-y divide-default">
        <li v-for="passkey in passkeys" :key="passkey.id" class="flex min-h-14 items-center gap-3 px-4 py-2 sm:px-5">
          <span class="grid size-8 shrink-0 place-items-center rounded-md border border-default bg-elevated text-muted">
            <UIcon name="i-lucide-key-round" class="size-4" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-highlighted">{{ passkey.name || "Passkey" }}</p>
            <p class="text-xs text-muted tabular-nums">
              Added {{ formatDate(new Date(passkey.createdAt)) }}<template v-if="passkey.backedUp"> · Synced</template>
            </p>
          </div>
          <UTooltip text="Delete passkey">
            <UButton color="neutral" variant="ghost" icon="i-lucide-trash-2" :aria-label="`Delete ${passkey.name || 'passkey'}`" @click="remove(passkey)" />
          </UTooltip>
        </li>
      </ul>
    </div>
  </SettingsSection>
</template>
