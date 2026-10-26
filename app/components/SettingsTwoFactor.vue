<script setup lang="ts">
// Two-factor: after your password, a six-digit code from an authenticator app. Turning it on takes three steps in a
// modal: confirm your password, scan the QR (or paste the key) and enter a code, then keep the backup codes.
const { $auth } = useNuxtApp()
const session = useAuthSession()
const notify = useNotify()
const enabled = computed(() => Boolean((session.user.value as { twoFactorEnabled?: boolean } | null)?.twoFactorEnabled))

const open = ref(false)
const step = ref<"password" | "scan" | "codes">("password")
const mode = ref<"enable" | "disable" | "regenerate">("enable")
const password = ref("")
const code = ref("")
const totpURI = ref("")
const backupCodes = ref<string[]>([])
const pending = ref(false)
const error = ref("")

const secret = computed(() => {
  if (!totpURI.value || !URL.canParse(totpURI.value)) return ""
  return new URL(totpURI.value).searchParams.get("secret") ?? ""
})
/** The key in groups of four, as authenticator apps show it. */
const groupedSecret = computed(() => secret.value.replace(/(.{4})/g, "$1 ").trim())

function start(next: typeof mode.value) {
  mode.value = next
  step.value = "password"
  password.value = ""
  code.value = ""
  error.value = ""
  totpURI.value = ""
  backupCodes.value = []
  open.value = true
}

async function confirmPassword() {
  if (!password.value) return (error.value = "Enter your password.")
  pending.value = true
  error.value = ""
  try {
    if (mode.value === "enable") {
      const { data, error: failure } = await $auth.twoFactor.enable({ password: password.value })
      if (failure || !data || !("totpURI" in data)) throw new Error(failure?.message || "Couldn’t start two-factor setup.")
      totpURI.value = data.totpURI
      backupCodes.value = data.backupCodes
      step.value = "scan"
    } else if (mode.value === "disable") {
      const { error: failure } = await $auth.twoFactor.disable({ password: password.value })
      if (failure) throw new Error(failure.message || "Couldn’t turn off two-factor.")
      await session.refresh()
      open.value = false
      notify.success("Two-factor is off", "You sign in with your password or a passkey only.")
    } else {
      const { data, error: failure } = await $auth.twoFactor.generateBackupCodes({ password: password.value })
      if (failure || !data) throw new Error(failure?.message || "Couldn’t make new backup codes.")
      backupCodes.value = data.backupCodes
      step.value = "codes"
    }
  } catch (cause) {
    error.value = errorText(cause)
  } finally {
    pending.value = false
  }
}

async function verify() {
  const digits = code.value.replace(/\s/g, "")
  if (!/^\d{6}$/.test(digits)) return (error.value = "Enter the six digits your app shows.")
  pending.value = true
  error.value = ""
  try {
    const { error: failure } = await $auth.twoFactor.verifyTotp({ code: digits })
    if (failure) throw new Error(failure.message || "That code didn’t match. Check your phone’s clock and try the next one.")
    await session.refresh()
    step.value = "codes"
  } catch (cause) {
    error.value = errorText(cause)
  } finally {
    pending.value = false
  }
}

const { copy, copied } = useClipboard({ copiedDuring: 1500, legacy: true })
function download() {
  const blob = new Blob([`Joxi backup codes\nEach works once, instead of a code from your app.\n\n${backupCodes.value.join("\n")}\n`], { type: "text/plain" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = "joxi-backup-codes.txt"
  link.click()
  URL.revokeObjectURL(link.href)
}

const title = computed(() =>
  mode.value === "disable" ? "Turn off two-factor" : mode.value === "regenerate" ? "New backup codes" : "Turn on two-factor",
)
</script>

<template>
  <SettingsSection title="Two-factor authentication" description="After your password, Joxi asks for a code from an authenticator app.">
    <template #badge>
      <UBadge v-if="enabled" color="success" variant="subtle" icon="i-lucide-shield-check" size="sm" label="On" />
      <UBadge v-else color="neutral" variant="outline" size="sm" label="Off" />
    </template>
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p class="text-sm text-muted">
        {{ enabled ? "Signing in with a password needs a code too. Passkeys don’t." : "Use 1Password, Google Authenticator, or any app that shows six-digit codes." }}
      </p>
      <div class="flex shrink-0 gap-2">
        <template v-if="enabled">
          <UButton color="neutral" variant="outline" label="New backup codes" @click="start('regenerate')" />
          <UButton color="neutral" variant="outline" label="Turn off" @click="start('disable')" />
        </template>
        <UButton v-else label="Turn on" @click="start('enable')" />
      </div>
    </div>
  </SettingsSection>

  <UModal v-model:open="open" :title="title" :dismissible="step !== 'codes'" :ui="{ content: 'max-w-md' }">
    <template #description>
      <span v-if="step === 'password'">Confirm your password to continue.</span>
      <span v-else-if="step === 'scan'">Scan the code with your authenticator app, then enter the code it shows.</span>
      <span v-else>Each code signs you in once if you lose your phone. They won’t be shown again.</span>
    </template>
    <template #body>
      <form v-if="step === 'password'" id="two-factor-password" class="flex flex-col gap-4" @submit.prevent="confirmPassword">
        <UFormField label="Password" :error="error || undefined">
          <UInput v-model="password" type="password" autocomplete="current-password" autofocus class="w-full" />
        </UFormField>
      </form>

      <form v-else-if="step === 'scan'" id="two-factor-verify" class="flex flex-col gap-4" @submit.prevent="verify">
        <div class="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <QrCode :value="totpURI" label="QR code for your authenticator app" class="size-40 shrink-0 border border-default p-1" />
          <div class="flex min-w-0 flex-1 flex-col gap-2 self-stretch">
            <p class="text-sm text-muted">Can’t scan? Enter this key in the app:</p>
            <CodeSnippet :code="groupedSecret" label="setup key" wrap />
            <details class="text-sm text-muted">
              <summary class="cursor-pointer rounded-sm py-1 focus-visible:outline-2 focus-visible:outline-primary">Or paste the full link</summary>
              <div class="mt-2"><CodeSnippet :code="totpURI" label="setup link" wrap /></div>
            </details>
          </div>
        </div>
        <UFormField label="Code from the app" :error="error || undefined">
          <UInput
            v-model="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="123 456"
            maxlength="7"
            autofocus
            class="w-full"
            :ui="{ base: 'tabular-nums tracking-normal' }"
          />
        </UFormField>
      </form>

      <div v-else class="flex flex-col gap-3">
        <ul class="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-default bg-muted p-3 font-mono text-sm text-highlighted" aria-label="Backup codes">
          <li v-for="item in backupCodes" :key="item" class="tabular-nums">{{ item }}</li>
        </ul>
        <div class="flex gap-2">
          <UButton
            color="neutral"
            variant="outline"
            :icon="copied ? 'i-lucide-copy-check' : 'i-lucide-copy'"
            :label="copied ? 'Copied' : 'Copy'"
            @click="copy(backupCodes.join('\n'))"
          />
          <UButton color="neutral" variant="outline" icon="i-lucide-download" label="Download" @click="download" />
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <template v-if="step === 'password'">
          <UButton color="neutral" variant="outline" label="Cancel" @click="open = false" />
          <UButton
            type="submit"
            form="two-factor-password"
            :color="mode === 'disable' ? 'error' : 'primary'"
            :label="mode === 'disable' ? 'Turn off' : 'Continue'"
            :loading="pending"
          />
        </template>
        <template v-else-if="step === 'scan'">
          <UButton color="neutral" variant="outline" label="Cancel" @click="open = false" />
          <UButton type="submit" form="two-factor-verify" label="Verify and turn on" :loading="pending" />
        </template>
        <UButton v-else label="I’ve saved them" @click="open = false" />
      </div>
    </template>
  </UModal>
</template>
