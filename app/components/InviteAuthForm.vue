<script setup lang="ts">
// Sign in or create an account without leaving the page: an invitation (/invite/<id>) or an agent's consent (/oauth).
// Email and password or a passkey; the two-factor code, when the account has one, is asked for right here. A sign-up
// sends the invitation's id, which is what lets it through on a server without Email (server/utils/sign-up.ts); with
// Email, it waits for the address to be confirmed and comes back here from the link.
const props = withDefaults(
  defineProps<{
    email?: string
    /** The invitation is for this email: don't let it change. */
    lockEmail?: boolean
    allowSignUp?: boolean
    initialMode?: "sign-in" | "sign-up"
    /** The invitation being answered, sent with a sign-up. */
    invitationId?: string
  }>(),
  { email: "", allowSignUp: true, initialMode: "sign-in" },
)
const emit = defineEmits<{ done: [] }>()

const { $auth } = useNuxtApp()
const route = useRoute()
const { locale } = useLanguage()
const session = useAuthSession()
const mode = ref<"sign-in" | "sign-up" | "2fa" | "sent">(props.initialMode)
const state = reactive({ name: "", email: props.email, password: "", code: "" })
watch(
  () => props.email,
  (value) => value && (state.email = value),
)
const backup = ref(false)
const reveal = ref(false)
const pending = ref<"password" | "passkey" | "code" | null>(null)
const error = ref("")

async function finish() {
  await session.refresh()
  emit("done")
}

async function signIn() {
  pending.value = "password"
  error.value = ""
  try {
    const { data, error: failure } = await $auth.signIn.email({ email: state.email.trim(), password: state.password })
    if (failure?.code === "EMAIL_NOT_VERIFIED") throw new Error(translate('confirmYourEmailFirst'))
    if (failure) throw Object.assign(new Error(failure.status === 401 ? translate('thatEmailAndPasswordDonTMatch') : failure.message), { code: failure.code })
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      mode.value = "2fa"
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

async function signUp() {
  pending.value = "password"
  error.value = ""
  try {
    const { data, error: failure } = await $auth.signUp.email({
      language: locale.value,
      name: state.name.trim(),
      email: state.email.trim(),
      password: state.password,
      callbackURL: route.fullPath,
      ...(props.invitationId ? { invitationId: props.invitationId } : {}),
    })
    if (failure) {
      if (failure.code === "SIGN_UP_WRONG_INVITATION") throw new Error(translate('signUpWrongInvitation'))
      if (failure.code === "SIGN_UP_NEEDS_INVITATION") throw new Error(translate('signUpNeedsInvitation'))
      // The server's user hook refuses emails outside FINANCE_ALLOWED_EMAILS that no household invited.
      if (failure.status === 422 || failure.status === 403 || /create user/i.test(failure.message ?? ""))
        throw new Error(translate('thisEmailCanTSignUpHereUseTheEmail'))
      throw Object.assign(new Error(failure.message), { code: failure.code })
    }
    // No session yet: the address is confirmed first.
    if (!data?.token) {
      mode.value = "sent"
      return
    }
    await finish()
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTCreateTheAccountTryAgain'))
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
      ? await $auth.twoFactor.verifyBackupCode({ code })
      : await $auth.twoFactor.verifyTotp({ code })
    if (failure) throw new Error(backup.value ? translate('thatBackupCodeDoesnTWork') : translate('thatCodeDoesnTMatchCodesChangeEvery30Seconds'))
    await finish()
  } catch (cause) {
    error.value = errorText(cause)
  } finally {
    pending.value = null
  }
}

function validate(values: typeof state) {
  const errors: Array<{ name: string; message: string }> = []
  if (mode.value === "2fa") {
    if (!values.code.trim()) errors.push({ name: "code", message: backup.value ? translate('enterABackupCode') : translate('enterThe6DigitCode') })
    return errors
  }
  if (mode.value === "sign-up" && !values.name.trim()) errors.push({ name: "name", message: translate('enterYourName') })
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.push({ name: "email", message: translate('enterYourEmail') })
  if (mode.value === "sign-up" && values.password.length < 10) errors.push({ name: "password", message: translate('useAtLeast10Characters') })
  if (mode.value === "sign-in" && !values.password) errors.push({ name: "password", message: translate('enterYourPassword') })
  return errors
}

const submit = () => (mode.value === "2fa" ? verify() : mode.value === "sign-up" ? signUp() : signIn())
const switchMode = (next: "sign-in" | "sign-up") => {
  mode.value = next
  error.value = ""
}
</script>

<template>
  <UAlert
    v-if="mode === 'sent'"
    color="neutral"
    variant="subtle"
    icon="i-lucide-mail-check"
    :title="$t('checkYourEmail')"
    :description="$t('confirmEmailSent', { email: state.email.trim() })"
  />
  <UForm v-else :state="state" :validate="validate" :validate-on="['blur']" class="flex flex-col gap-4" @submit="submit">
    <template v-if="mode === '2fa'">
      <p class="text-sm text-muted">
        {{ backup ? $t('enterOneOfTheBackupCodesYouSavedWhenYou') : $t('enterThe6DigitCodeFromYourAuthenticatorApp') }}
      </p>
      <UFormField :label="backup ? $t('backupCode') : $t('code')" name="code">
        <UInput
          v-model="state.code"
          :inputmode="backup ? 'text' : 'numeric'"
          autocomplete="one-time-code"
          :placeholder="backup ? 'xxxxx-xxxxx' : '123456'"
          class="w-full"
          :ui="{ base: 'tabular-nums tracking-normal' }"
          autofocus
        />
      </UFormField>
      <UButton type="submit" block :label="$t('verify')" :loading="pending === 'code'" />
      <UButton
        variant="link"
        color="neutral"
        class="self-center"
        :label="backup ? $t('useTheAuthenticatorCode') : $t('useABackupCode')"
        @click="((backup = !backup), (state.code = ''))"
      />
    </template>

    <template v-else>
      <UFormField v-if="mode === 'sign-up'" :label="$t('name')" name="name">
        <UInput v-model="state.name" autocomplete="name" :placeholder="$t('pabloGarcA')" class="w-full" />
      </UFormField>
      <UFormField :label="$t('email')" name="email">
        <UInput
          v-model="state.email"
          type="email"
          :autocomplete="mode === 'sign-in' ? 'username webauthn' : 'email'"
          :placeholder="$t('youExampleCom')"
          :disabled="lockEmail"
          class="w-full"
        />
      </UFormField>
      <UFormField :label="$t('password')" name="password" :help="mode === 'sign-up' ? $t('atLeast10Characters') : undefined">
        <UInput
          v-model="state.password"
          :type="reveal ? 'text' : 'password'"
          :autocomplete="mode === 'sign-up' ? 'new-password' : 'current-password'"
          class="w-full"
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
      <UButton type="submit" block :label="mode === 'sign-up' ? $t('createAccount') : $t('signIn')" :loading="pending === 'password'" :disabled="pending !== null" />
      <template v-if="mode === 'sign-in'">
        <USeparator :label="$t('or')" :ui="{ label: 'text-xs text-muted' }" />
        <UButton
          block
          color="neutral"
          variant="outline"
          icon="i-lucide-key-round"
          :label="$t('signInWithAPasskey')"
          :loading="pending === 'passkey'"
          :disabled="pending !== null"
          @click="signInWithPasskey"
        />
      </template>
      <p v-if="allowSignUp" class="text-center text-sm text-muted">
        <template v-if="mode === 'sign-in'"> {{ $t('newToVitehubFinance') }} <UButton variant="link" color="neutral" class="p-0 font-medium text-highlighted" :label="$t('createAnAccount')" @click="switchMode('sign-up')" />
        </template>
        <template v-else> {{ $t('alreadyHaveAnAccount') }} <UButton variant="link" color="neutral" class="p-0 font-medium text-highlighted" :label="$t('signIn')" @click="switchMode('sign-in')" />
        </template>
      </p>
    </template>

    <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
  </UForm>
</template>
