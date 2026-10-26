<script setup lang="ts">
// Sign in or create an account without leaving the page: an invitation (/invite/<id>) or an agent's consent (/oauth).
// Email and password or a passkey; the two-factor code, when the account has one, is asked for right here.
const props = withDefaults(
  defineProps<{
    email?: string
    /** The invitation is for this email: don't let it change. */
    lockEmail?: boolean
    allowSignUp?: boolean
    initialMode?: "sign-in" | "sign-up"
  }>(),
  { email: "", allowSignUp: true, initialMode: "sign-in" },
)
const emit = defineEmits<{ done: [] }>()

const { $auth } = useNuxtApp()
const session = useAuthSession()
const mode = ref<"sign-in" | "sign-up" | "2fa">(props.initialMode)
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
    if (failure) throw new Error(failure.status === 401 ? "That email and password don’t match." : failure.message)
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      mode.value = "2fa"
      return
    }
    await finish()
  } catch (cause) {
    error.value = errorText(cause, "Couldn’t sign in. Try again.")
  } finally {
    pending.value = null
  }
}

async function signInWithPasskey() {
  pending.value = "passkey"
  error.value = ""
  try {
    const result = await $auth.signIn.passkey()
    if (result?.error) throw new Error(result.error.message || "The passkey didn’t work.")
    await finish()
  } catch (cause) {
    error.value = errorText(cause, "The passkey didn’t work. Try your password.")
  } finally {
    pending.value = null
  }
}

async function signUp() {
  pending.value = "password"
  error.value = ""
  try {
    const { error: failure } = await $auth.signUp.email({ name: state.name.trim(), email: state.email.trim(), password: state.password })
    if (failure) {
      // The server's user hook refuses emails outside FINANCE_ALLOWED_EMAILS that no household invited.
      if (failure.status === 422 || failure.status === 403 || /create user/i.test(failure.message ?? ""))
        throw new Error("This ViteHub Finance only lets invited and allowed emails sign up. Use the email the invitation went to.")
      throw new Error(failure.message)
    }
    await finish()
  } catch (cause) {
    error.value = errorText(cause, "Couldn’t create the account. Try again.")
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
    if (failure) throw new Error(backup.value ? "That backup code doesn’t work." : "That code doesn’t match. Codes change every 30 seconds.")
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
    if (!values.code.trim()) errors.push({ name: "code", message: backup.value ? "Enter a backup code." : "Enter the 6-digit code." })
    return errors
  }
  if (mode.value === "sign-up" && !values.name.trim()) errors.push({ name: "name", message: "Enter your name." })
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.push({ name: "email", message: "Enter your email." })
  if (mode.value === "sign-up" && values.password.length < 10) errors.push({ name: "password", message: "Use at least 10 characters." })
  if (mode.value === "sign-in" && !values.password) errors.push({ name: "password", message: "Enter your password." })
  return errors
}

const submit = () => (mode.value === "2fa" ? verify() : mode.value === "sign-up" ? signUp() : signIn())
const switchMode = (next: "sign-in" | "sign-up") => {
  mode.value = next
  error.value = ""
}
</script>

<template>
  <UForm :state="state" :validate="validate" :validate-on="['blur']" class="flex flex-col gap-4" @submit="submit">
    <template v-if="mode === '2fa'">
      <p class="text-sm text-muted">
        {{ backup ? "Enter one of the backup codes you saved when you turned on two-factor." : "Enter the 6-digit code from your authenticator app." }}
      </p>
      <UFormField :label="backup ? 'Backup code' : 'Code'" name="code">
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
      <UButton type="submit" block label="Verify" :loading="pending === 'code'" />
      <UButton
        variant="link"
        color="neutral"
        class="self-center"
        :label="backup ? 'Use the authenticator code' : 'Use a backup code'"
        @click="((backup = !backup), (state.code = ''))"
      />
    </template>

    <template v-else>
      <UFormField v-if="mode === 'sign-up'" label="Name" name="name">
        <UInput v-model="state.name" autocomplete="name" placeholder="Pablo García" class="w-full" />
      </UFormField>
      <UFormField label="Email" name="email">
        <UInput
          v-model="state.email"
          type="email"
          :autocomplete="mode === 'sign-in' ? 'username webauthn' : 'email'"
          placeholder="you@example.com"
          :disabled="lockEmail"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Password" name="password" :help="mode === 'sign-up' ? 'At least 10 characters.' : undefined">
        <UInput
          v-model="state.password"
          :type="reveal ? 'text' : 'password'"
          :autocomplete="mode === 'sign-up' ? 'new-password' : 'current-password'"
          class="w-full"
          :ui="{ trailing: 'pe-1' }"
        >
          <template #trailing>
            <UTooltip :text="reveal ? 'Hide password' : 'Show password'">
              <UButton
                color="neutral"
                variant="link"
                size="sm"
                :icon="reveal ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                :aria-label="reveal ? 'Hide password' : 'Show password'"
                :aria-pressed="reveal"
                @click="reveal = !reveal"
              />
            </UTooltip>
          </template>
        </UInput>
      </UFormField>
      <UButton type="submit" block :label="mode === 'sign-up' ? 'Create account' : 'Sign in'" :loading="pending === 'password'" :disabled="pending !== null" />
      <template v-if="mode === 'sign-in'">
        <USeparator label="or" :ui="{ label: 'text-xs text-muted' }" />
        <UButton
          block
          color="neutral"
          variant="outline"
          icon="i-lucide-key-round"
          label="Sign in with a passkey"
          :loading="pending === 'passkey'"
          :disabled="pending !== null"
          @click="signInWithPasskey"
        />
      </template>
      <p v-if="allowSignUp" class="text-center text-sm text-muted">
        <template v-if="mode === 'sign-in'">
          New to ViteHub Finance?
          <UButton variant="link" color="neutral" class="p-0 font-medium text-highlighted" label="Create an account" @click="switchMode('sign-up')" />
        </template>
        <template v-else>
          Already have an account?
          <UButton variant="link" color="neutral" class="p-0 font-medium text-highlighted" label="Sign in" @click="switchMode('sign-in')" />
        </template>
      </p>
    </template>

    <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
  </UForm>
</template>
