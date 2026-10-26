<script setup lang="ts">
// Sign in: email and password, a passkey (also offered by the browser's autofill on the email field), a magic link when
// this ViteHub Finance can send email, and the two-factor step (?step=2fa) with an authenticator or a backup code.
definePageMeta({ layout: "auth" })
useHead({ title: "Sign in" })

const route = useRoute()
const { $auth } = useNuxtApp()
const session = useAuthSession()
const emailWorks = useRuntimeConfig().public.email
const demo = useDemo()
const step = computed(() => (route.query.step === "2fa" ? "2fa" : "sign-in"))
const redirect = computed(() => safeRedirect(route.query.redirect))

const state = reactive({ email: "", password: "", code: "", trust: true })
const backup = ref(false)
const reveal = ref(false)
const pending = ref<"demo" | "password" | "passkey" | "magic" | "code" | null>(null)
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

/** The demo's way in: the server seeds the household if needed and signs in as Lucía. */
async function exploreDemo() {
  pending.value = "demo"
  error.value = ""
  try {
    await $fetch("/api/demo/session", { method: "POST", body: { as: "lucia" } })
    await session.refresh()
    await navigateTo("/")
  } catch (cause) {
    error.value = errorText(cause, "Couldn’t open the demo. Try again.")
  } finally {
    pending.value = null
  }
}

async function signIn() {
  pending.value = "password"
  error.value = ""
  try {
    const { data, error: failure } = await $auth.signIn.email({ email: state.email.trim(), password: state.password })
    if (failure) throw new Error(failure.status === 401 ? "That email and password don’t match." : failure.message)
    // With two-factor on, the plugin sends us to ?step=2fa (plugins/auth.ts); keep where we were headed.
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      await navigateTo({ path: "/login", query: { step: "2fa", redirect: route.query.redirect } })
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

async function sendMagicLink() {
  if (!state.email.trim()) {
    error.value = "Enter your email first, then ask for a link."
    return
  }
  pending.value = "magic"
  error.value = ""
  try {
    const { error: failure } = await $auth.signIn.magicLink({ email: state.email.trim(), callbackURL: redirect.value })
    if (failure) throw new Error(failure.message)
    magicSent.value = true
  } catch (cause) {
    error.value = errorText(cause, "Couldn’t send the link. Try again.")
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
    if (failure) throw new Error(backup.value ? "That backup code didn’t work." : "That code didn’t work. Codes change every 30 seconds.")
    await finish()
  } catch (cause) {
    error.value = errorText(cause, "That code didn’t work.")
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
  <div class="rounded-xl border border-default bg-default p-6 shadow-xs">
    <template v-if="step === '2fa'">
      <h1 class="text-lg font-semibold text-highlighted">Two-factor check</h1>
      <p class="mt-1 text-sm text-muted">
        {{ backup ? "Enter one of the backup codes you saved when you turned on two-factor." : "Enter the 6-digit code from your authenticator app." }}
      </p>
      <UForm :state="state" class="mt-6 flex flex-col gap-4" @submit="verify">
        <UFormField :label="backup ? 'Backup code' : 'Code'" name="code">
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
        <UCheckbox v-model="state.trust" label="Trust this device for 30 days" />
        <UButton type="submit" block label="Verify" :loading="pending === 'code'" />
      </UForm>
      <p v-if="error" class="mt-3 text-sm text-error" role="alert">{{ error }}</p>
      <div class="mt-4 flex items-center justify-between gap-2 text-sm">
        <UButton variant="link" color="neutral" class="px-0" :label="backup ? 'Use your authenticator' : 'Use a backup code'" @click="backup = !backup" />
        <UButton variant="link" color="neutral" class="px-0 text-muted" label="Start over" to="/login" />
      </div>
    </template>

    <template v-else-if="magicSent">
      <UIcon name="i-lucide-mail-check" class="size-6 text-muted" />
      <h1 class="mt-3 text-lg font-semibold text-highlighted">Check your email</h1>
      <p class="mt-1 text-sm text-muted">
        We sent a sign-in link to <span class="font-medium text-highlighted">{{ state.email }}</span>. It works for 5 minutes.
      </p>
      <UButton class="mt-6" block color="neutral" variant="outline" label="Back to sign in" @click="magicSent = false" />
    </template>

    <template v-else>
      <h1 class="text-lg font-semibold text-highlighted">Sign in to ViteHub Finance</h1>
      <p class="mt-1 text-sm text-muted">Your household’s money, in one place.</p>

      <template v-if="demo">
        <UButton
          class="mt-6"
          block
          size="lg"
          icon="i-lucide-arrow-right"
          trailing
          label="Explore the demo"
          :loading="pending === 'demo'"
          :disabled="pending !== null && pending !== 'demo'"
          @click="exploreDemo"
        />
        <p class="mt-2 text-center text-xs text-muted">A fictional household in Madrid. Its data resets every night.</p>
        <USeparator label="or sign in" class="mt-5" :ui="{ label: 'text-xs text-muted' }" />
      </template>

      <UForm :state="state" class="mt-6 flex flex-col gap-4" @submit="signIn">
        <UFormField label="Email" name="email" :hint="lastUsed === 'email' ? 'Last used' : undefined">
          <UInput
            v-model="state.email"
            type="email"
            autocomplete="username webauthn"
            placeholder="you@example.com"
            class="w-full"
            required
            :autofocus="!demo"
          />
        </UFormField>
        <UFormField label="Password" name="password">
          <UInput
            v-model="state.password"
            :type="reveal ? 'text' : 'password'"
            autocomplete="current-password"
            class="w-full"
            required
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
        <UButton type="submit" block label="Sign in" :loading="pending === 'password'" :disabled="pending !== null && pending !== 'password'" />
      </UForm>

      <USeparator label="or" class="my-5" :ui="{ label: 'text-xs text-muted' }" />

      <div class="flex flex-col gap-2">
        <UButton
          block
          color="neutral"
          variant="outline"
          icon="i-lucide-fingerprint"
          :loading="pending === 'passkey'"
          :disabled="pending !== null && pending !== 'passkey'"
          @click="signInWithPasskey"
        >
          Sign in with a passkey
          <UBadge v-if="lastUsed === 'passkey'" label="Last used" size="sm" color="neutral" variant="subtle" class="ms-1" />
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
        >
          Email me a sign-in link
          <UBadge v-if="lastUsed === 'magic-link'" label="Last used" size="sm" color="neutral" variant="subtle" class="ms-1" />
        </UButton>
      </div>

      <p v-if="error" class="mt-4 text-sm text-error" role="alert">{{ error }}</p>
    </template>
  </div>
  <p v-if="step !== '2fa' && !demo" class="mt-6 text-center text-sm text-muted">
    New here?
    <ULink :to="{ path: '/signup', query: route.query.redirect ? { redirect: route.query.redirect } : {} }" class="font-medium text-highlighted underline-offset-4 hover:underline">Create an account</ULink>
  </p>
  <LegalLinks :class="demo && step !== '2fa' ? 'mt-6' : 'mt-4'" />
</template>
