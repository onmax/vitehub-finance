<script setup lang="ts">
// Create an account. A new account gets its own household; people invited to one join it from /invite/<id> instead.
// With Email, the account opens once its address is confirmed from the link sent to it; without, the server takes only
// its first person here, and everyone else signs up from an invitation (server/utils/sign-up.ts).
// The demo build has no sign-up: visitors go straight into the demo household (middleware/auth.global.ts).
definePageMeta({ layout: "auth" })
useHead({ get title() { return translate('createAnAccount') } })

const route = useRoute()
const { $auth } = useNuxtApp()
const { locale } = useLanguage()
const session = useAuthSession()
const state = reactive({ name: "", email: "", password: "" })
const reveal = ref(false)
const pending = ref(false)
const error = ref("")
// Why sign-up was refused: the translation key of the explanation.
const refused = ref<string | null>(null)
// The address a confirmation link went to.
const sent = ref("")

function validate(values: typeof state) {
  const errors: Array<{ name: string; message: string }> = []
  if (!values.name.trim()) errors.push({ name: "name", message: translate('tellUsWhatToCallYou') })
  if (values.password && values.password.length < 10) errors.push({ name: "password", message: translate('useAtLeast10Characters') })
  return errors
}

async function submit() {
  pending.value = true
  error.value = ""
  refused.value = null
  try {
    const email = state.email.trim()
    const { data, error: failure } = await $auth.signUp.email({
      language: locale.value,
      name: state.name.trim(),
      email,
      password: state.password,
      callbackURL: safeRedirect(route.query.redirect),
    })
    if (failure) {
      if (/already exists/i.test(failure.message ?? "") || failure.code === "USER_ALREADY_EXISTS") {
        throw new Error(translate('thereSAlreadyAnAccountWithThisEmailSignIn'))
      }
      // Without Email, only the first person signs up here.
      if (failure.code === "SIGN_UP_NEEDS_INVITATION") {
        refused.value = "signUpNeedsInvitation"
        return
      }
      // The server's user hook refuses emails outside FINANCE_ALLOWED_EMAILS that no household invited.
      if (failure.status === 422 || failure.status === 403 || /create user/i.test(failure.message ?? "")) {
        refused.value = "onlyAllowedEmailsCanSignUpHereIfSomeoneInvited"
        return
      }
      throw Object.assign(new Error(failure.message), { code: failure.code })
    }
    // No session yet: the address is confirmed first.
    if (!data?.token) {
      sent.value = email
      return
    }
    await session.refresh()
    await navigateTo(safeRedirect(route.query.redirect))
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTCreateTheAccountTryAgain'))
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="text-lg font-semibold text-highlighted">{{ $t('createYourAccount') }}</h1>
    <p class="mt-1 text-sm text-muted">{{ $t('youGetAHouseholdOfYourOwnInviteOthersTo') }}</p>

    <UAlert
      v-if="sent"
      class="mt-6"
      color="neutral"
      variant="subtle"
      icon="i-lucide-mail-check"
      :title="$t('checkYourEmail')"
      :description="$t('confirmEmailSent', { email: sent })"
    />
    <UForm v-else :state="state" :validate="validate" class="mt-6 flex flex-col gap-4" @submit="submit">
      <UFormField :label="$t('name')" name="name">
        <UInput v-model="state.name" autocomplete="name" placeholder="Lucía Martín" class="w-full" required autofocus />
      </UFormField>
      <UFormField :label="$t('email')" name="email">
        <UInput v-model="state.email" type="email" autocomplete="email" :placeholder="$t('youExampleCom')" class="w-full" required />
      </UFormField>
      <UFormField :label="$t('password')" name="password" :help="$t('atLeast10Characters')">
        <UInput
          v-model="state.password"
          :type="reveal ? 'text' : 'password'"
          autocomplete="new-password"
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
      <UAlert
        v-if="refused"
        color="neutral"
        variant="subtle"
        icon="i-lucide-lock"
        :title="$t('signUpIsByInvitation')"
        :description="$t(refused)"
      />
      <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
      <UButton type="submit" block :label="$t('createAccount')" :loading="pending" />
    </UForm>
  </div>
  <p class="mt-6 text-center text-sm text-muted"> {{ $t('alreadyHaveAnAccount') }} <ULink :to="{ path: '/login', query: route.query.redirect ? { redirect: route.query.redirect } : {} }" class="font-medium text-highlighted underline-offset-4 hover:underline">{{ $t('signIn') }}</ULink>
  </p>
  <LegalLinks class="mt-4" />
</template>
