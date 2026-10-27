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
// A second factor on a demo person would lock every other visitor out; the server refuses it there too.
const demo = useDemo()

const secret = computed(() => {
  if (!totpURI.value || !URL.canParse(totpURI.value)) return ""
  return new URL(totpURI.value).searchParams.get("secret") ?? ""
})
/** The key in groups of four, as authenticator apps show it. */
const groupedSecret = computed(() => secret.value.replace(/(.{4})/g, "$1 ").trim())

function start(next: typeof mode.value) {
  if (demo) return
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
  if (!password.value) return (error.value = translate('enterYourPassword'))
  pending.value = true
  error.value = ""
  try {
    if (mode.value === "enable") {
      const { data, error: failure } = await $auth.twoFactor.enable({ password: password.value })
      if (failure || !data || !("totpURI" in data)) throw Object.assign(new Error(failure?.message || translate('couldnTStartTwoFactorSetup')), { code: failure?.code })
      totpURI.value = data.totpURI
      backupCodes.value = data.backupCodes
      step.value = "scan"
    } else if (mode.value === "disable") {
      const { error: failure } = await $auth.twoFactor.disable({ password: password.value })
      if (failure) throw Object.assign(new Error(failure.message || translate('couldnTTurnOffTwoFactor')), { code: failure.code })
      await session.refresh()
      open.value = false
      notify.success(translate('twoFactorIsOff'), translate('youSignInWithYourPasswordOrAPasskeyOnly'))
    } else {
      const { data, error: failure } = await $auth.twoFactor.generateBackupCodes({ password: password.value })
      if (failure || !data) throw Object.assign(new Error(failure?.message || translate('couldnTMakeNewBackupCodes')), { code: failure?.code })
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
  if (!/^\d{6}$/.test(digits)) return (error.value = translate('enterTheSixDigitsYourAppShows'))
  pending.value = true
  error.value = ""
  try {
    const { error: failure } = await $auth.twoFactor.verifyTotp({ code: digits })
    if (failure) throw Object.assign(new Error(failure.message || translate('thatCodeDidnTMatchCheckYourPhoneSClock')), { code: failure.code })
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
  const blob = new Blob([translate('vitehubFinanceBackupCodesEachWorksOnceInsteadOfA', { value1: backupCodes.value.join("\n") })], { type: "text/plain" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = "finance-backup-codes.txt"
  link.click()
  URL.revokeObjectURL(link.href)
}

const title = computed(() =>
  mode.value === "disable" ? translate('turnOffTwoFactor') : mode.value === "regenerate" ? translate('newBackupCodes') : translate('turnOnTwoFactor'),
)
</script>

<template>
  <SettingsSection :title="$t('twoFactorAuthentication')" :description="$t('afterYourPasswordYouEnterACodeFromAnAuthenticator')">
    <template #badge>
      <UBadge v-if="enabled" color="success" variant="subtle" icon="i-lucide-shield-check" size="sm" :label="$t('on')" />
      <UBadge v-else color="neutral" variant="outline" size="sm" :label="$t('off')" />
    </template>
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p class="text-sm text-muted">
        {{ enabled ? $t('signingInWithAPasswordNeedsACodeTooPasskeys') : $t('use1passwordGoogleAuthenticatorOrAnyAppThatShowsSix') }}
      </p>
      <DemoLock v-slot="{ locked }">
        <div class="flex shrink-0 gap-2">
          <template v-if="enabled">
            <UButton color="neutral" variant="outline" :label="$t('newBackupCodes')" :disabled="locked" @click="start('regenerate')" />
            <UButton color="neutral" variant="outline" :label="$t('turnOff')" :disabled="locked" @click="start('disable')" />
          </template>
          <UButton v-else :label="$t('turnOn')" :disabled="locked" @click="start('enable')" />
        </div>
      </DemoLock>
    </div>
  </SettingsSection>

  <UModal v-model:open="open" :title="title" :dismissible="step !== 'codes'" :ui="{ content: 'max-w-md' }">
    <template #description>
      <span v-if="step === 'password'">{{ $t('confirmYourPasswordToContinue') }}</span>
      <span v-else-if="step === 'scan'">{{ $t('scanTheCodeWithYourAuthenticatorAppThenEnterThe') }}</span>
      <span v-else>{{ $t('eachCodeSignsYouInOnceIfYouLoseYour') }}</span>
    </template>
    <template #body>
      <form v-if="step === 'password'" id="two-factor-password" class="flex flex-col gap-4" @submit.prevent="confirmPassword">
        <UFormField :label="$t('password')" :error="error || undefined">
          <UInput v-model="password" type="password" autocomplete="current-password" autofocus class="w-full" />
        </UFormField>
      </form>

      <form v-else-if="step === 'scan'" id="two-factor-verify" class="flex flex-col gap-4" @submit.prevent="verify">
        <div class="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <QrCode :value="totpURI" :label="$t('qrCodeForYourAuthenticatorApp')" class="size-40 shrink-0 border border-default p-1" />
          <div class="flex min-w-0 flex-1 flex-col gap-2 self-stretch">
            <p class="text-sm text-muted">{{ $t('canTScanEnterThisKeyInTheApp') }}</p>
            <CodeSnippet :code="groupedSecret" :label="$t('setupKey')" wrap />
            <details class="text-sm text-muted">
              <summary class="cursor-pointer rounded-sm py-1 focus-visible:outline-2 focus-visible:outline-primary">{{ $t('orPasteTheFullLink') }}</summary>
              <div class="mt-2"><CodeSnippet :code="totpURI" :label="$t('setupLink')" wrap /></div>
            </details>
          </div>
        </div>
        <UFormField :label="$t('codeFromTheApp')" :error="error || undefined">
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
        <ul class="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-muted p-3 font-mono text-sm text-highlighted" :aria-label="$t('backupCodes')">
          <li v-for="item in backupCodes" :key="item" class="tabular-nums">{{ item }}</li>
        </ul>
        <div class="flex gap-2">
          <UButton
            color="neutral"
            variant="outline"
            :icon="copied ? 'i-lucide-copy-check' : 'i-lucide-copy'"
            :label="copied ? $t('copied') : $t('copy2')"
            @click="copy(backupCodes.join('\n'))"
          />
          <UButton color="neutral" variant="outline" icon="i-lucide-download" :label="$t('download')" @click="download" />
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <template v-if="step === 'password'">
          <UButton color="neutral" variant="outline" :label="$t('cancel')" @click="open = false" />
          <UButton
            type="submit"
            form="two-factor-password"
            :color="mode === 'disable' ? 'error' : 'primary'"
            :label="mode === 'disable' ? $t('turnOff') : $t('continue')"
            :loading="pending"
          />
        </template>
        <template v-else-if="step === 'scan'">
          <UButton color="neutral" variant="outline" :label="$t('cancel')" @click="open = false" />
          <UButton type="submit" form="two-factor-verify" :label="$t('verifyAndTurnOn')" :loading="pending" />
        </template>
        <UButton v-else :label="$t('iVeSavedThem')" @click="open = false" />
      </div>
    </template>
  </UModal>
</template>
