<script setup lang="ts">
// Sign in: email and password, a passkey (also offered by the browser's autofill on the email field), a magic link when
// this ViteHub Finance can send email, and the two-factor step (?step=2fa) with an authenticator or a backup code. The
// demo build never shows it: visitors go straight into the demo household (middleware/auth.global.ts).
definePageMeta({ layout: "auth" })
useHead({ get title() { return translate('signIn') } })

const route = useRoute()
const { $auth } = useNuxtApp()
const session = useAuthSession()
const emailWorks = useRuntimeConfig().public.email
const step = computed(() => (route.query.step === "2fa" ? "2fa" : "sign-in"))
const redirect = computed(() => safeRedirect(route.query.redirect))

const state = reactive({ email: "", password: "", code: "", trust: true })
const backup = ref(false)
const reveal = ref(false)
const pending = ref<"password" | "passkey" | "magic" | "code" | null>(null)
const error = ref("")
const magicSent = ref(false)
const lastUsed = ref<string | null>(null)

onMounted(async () => {
  lastUsed.value = ((await $auth.getLastUsedLoginMethod()) as string | null) ?? null
  // Conditional UI: the browser lists passkeys in the email field's autofill; picking one signs in.
  if (step.value === "sign-in" && (await window.PublicKeyCredential?.isConditionalMediationAvailable?.())) {
    const result = await $auth.signIn.passkey({ autoFill: true }).catch(() => null)
    if (result && !result.error) await finish()
  }
})

async function finish() {
  await session.refresh()
  await navigateTo(redirect.value)
}

async function signIn() {
  pending.value = "password"
  error.value = ""
  try {
    const { data, error: failure } = await $auth.signIn.email({ email: state.email.trim(), password: state.password })
    if (failure) throw Object.assign(new Error(failure.status === 401 ? translate('thatEmailAndPasswordDonTMatch') : failure.message), { code: failure.code })
    // With two-factor on, the plugin sends us to ?step=2fa (plugins/auth.ts); keep where we were headed.
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      await navigateTo({ path: "/login", query: { step: "2fa", redirect: route.query.redirect } })
      return
    }
    await finish()
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTSignInTryAgain'))
  } finally {
    pending.value = null
  }
}

async function signInWithPasskey() {
  pending.value = "passkey"
  error.value = ""
  try {
    const result = await $auth.signIn.passkey()
    if (result?.error) throw Object.assign(new Error(result.error.message || translate('thePasskeyDidnTWork')), { code: "code" in result.error ? result.error.code : "PASSKEY_AUTH_FAILED" })
    await finish()
  } catch (cause) {
    error.value = errorText(cause, translate('thePasskeyDidnTWorkTryYourPassword'))
  } finally {
    pending.value = null
  }
}

async function sendMagicLink() {
  if (!state.email.trim()) {
    error.value = translate('enterYourEmailFirstThenAskForALink')
    return
  }
  pending.value = "magic"
  error.value = ""
  try {
    const { error: failure } = await $auth.signIn.magicLink({ email: state.email.trim(), callbackURL: redirect.value })
    if (failure) throw Object.assign(new Error(failure.message), { code: failure.code })
    magicSent.value = true
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTSendTheLinkTryAgain'))
  } finally {
    pending.value = null
  }
}

async function verify() {
  pending.value = "code"
  error.value = ""
  try {
    const code = state.code.replace(/\s/g, "")
    const { error: failure } = backup.value
      ? await $auth.twoFactor.verifyBackupCode({ code, trustDevice: state.trust })
      : await $auth.twoFactor.verifyTotp({ code, trustDevice: state.trust })
    if (failure) throw new Error(backup.value ? translate('thatBackupCodeDidnTWork') : translate('thatCodeDidnTWorkCodesChangeEvery30Seconds'))
    await finish()
  } catch (cause) {
    error.value = errorText(cause, translate('thatCodeDidnTWork'))
  } finally {
    pending.value = null
  }
}

watch(step, () => {
  error.value = ""
  state.code = ""
})
</script>

<template>
  <div>
    <template v-if="step === '2fa'">
      <h1 class="text-lg font-semibold text-highlighted">{{ $t('twoFactorCheck') }}</h1>
      <p class="mt-1 text-sm text-muted">
        {{ backup ? $t('enterOneOfTheBackupCodesYouSavedWhenYou') : $t('enterThe6DigitCodeFromYourAuthenticatorApp') }}
      </p>
      <UForm :state="state" class="mt-6 flex flex-col gap-4" @submit="verify">
        <UFormField :label="backup ? $t('backupCode') : $t('code')" name="code">
          <UInput
            v-model="state.code"
            :inputmode="backup ? 'text' : 'numeric'"
            autocomplete="one-time-code"
            :placeholder="backup ? 'xxxxx-xxxxx' : '123456'"
            class="w-full"
            :ui="{ base: 'tabular-nums tracking-wide' }"
            autofocus
            required
          />
        </UFormField>
        <UCheckbox v-model="state.trust" :label="$t('trustThisDeviceFor30Days')" />
        <UButton type="submit" block :label="$t('verify')" :loading="pending === 'code'" />
      </UForm>
      <p v-if="error" class="mt-3 text-sm text-error" role="alert">{{ error }}</p>
      <div class="mt-4 flex items-center justify-between gap-2 text-sm">
        <UButton variant="link" color="neutral" class="px-0" :label="backup ? $t('useYourAuthenticator') : $t('useABackupCode')" @click="backup = !backup" />
        <UButton variant="link" color="neutral" class="px-0 text-muted" :label="$t('startOver')" to="/login" />
      </div>
    </template>

    <template v-else-if="magicSent">
      <UIcon name="i-lucide-mail-check" class="size-6 text-muted" />
      <h1 class="mt-3 text-lg font-semibold text-highlighted">{{ $t('checkYourEmail') }}</h1>
      <p class="mt-1 text-sm text-muted"> {{ $t('openTheSignInLinkSentTo') }} <span class="font-medium text-highlighted">{{ state.email }}</span>{{ $t('itWorksFor5Minutes') }} </p>
      <UButton class="mt-6" block color="neutral" variant="outline" :label="$t('backToSignIn')" @click="magicSent = false" />
    </template>

    <template v-else>
      <h1 class="text-lg font-semibold text-highlighted">{{ $t('signInToVitehubFinance') }}</h1>
      <p class="mt-1 text-sm text-muted">{{ $t('yourHouseholdSMoneyInOnePlace') }}</p>

      <UForm :state="state" class="mt-6 flex flex-col gap-4" @submit="signIn">
        <UFormField :label="$t('email')" name="email" :hint="lastUsed === 'email' ? $t('lastUsed') : undefined">
          <UInput
            v-model="state.email"
            type="email"
            autocomplete="username webauthn"
            :placeholder="$t('youExampleCom')"
            class="w-full"
            required
            autofocus
          />
        </UFormField>
        <UFormField :label="$t('password')" name="password">
          <UInput
            v-model="state.password"
            :type="reveal ? 'text' : 'password'"
            autocomplete="current-password"
            class="w-full"
            required
            :ui="{ trailing: 'pe-1' }"
          >
            <template #trailing>
              <UTooltip :text="reveal ? $t('hidePassword') : $t('showPassword')">
                <UButton
                  color="neutral"
                  variant="link"
                  size="sm"
                  :icon="reveal ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  :aria-label="reveal ? $t('hidePassword') : $t('showPassword')"
                  :aria-pressed="reveal"
                  @click="reveal = !reveal"
                />
              </UTooltip>
            </template>
          </UInput>
        </UFormField>
        <UButton type="submit" block :label="$t('signIn')" :loading="pending === 'password'" :disabled="pending !== null && pending !== 'password'" />
      </UForm>

      <USeparator :label="$t('or')" class="my-5" :ui="{ label: 'text-xs text-muted' }" />

      <div class="flex flex-col gap-2">
        <UButton
          block
          color="neutral"
          variant="outline"
          icon="i-lucide-fingerprint"
          :loading="pending === 'passkey'"
          :disabled="pending !== null && pending !== 'passkey'"
          @click="signInWithPasskey"
        > {{ $t('signInWithAPasskey') }} <UBadge v-if="lastUsed === 'passkey'" :label="$t('lastUsed')" size="sm" color="neutral" variant="subtle" class="ms-1" />
        </UButton>
        <UButton
          v-if="emailWorks"
          block
          color="neutral"
          variant="outline"
          icon="i-lucide-mail"
          :loading="pending === 'magic'"
          :disabled="pending !== null && pending !== 'magic'"
          @click="sendMagicLink"
        > {{ $t('emailMeASignInLink') }} <UBadge v-if="lastUsed === 'magic-link'" :label="$t('lastUsed')" size="sm" color="neutral" variant="subtle" class="ms-1" />
        </UButton>
      </div>

      <p v-if="error" class="mt-4 text-sm text-error" role="alert">{{ error }}</p>
    </template>
  </div>
  <p v-if="step !== '2fa'" class="mt-6 text-center text-sm text-muted"> {{ $t('newHere') }} <ULink :to="{ path: '/signup', query: route.query.redirect ? { redirect: route.query.redirect } : {} }" class="font-medium text-highlighted underline-offset-4 hover:underline">{{ $t('createAnAccount') }}</ULink>
  </p>
  <LegalLinks class="mt-4" />
</template>
