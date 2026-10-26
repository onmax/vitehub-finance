<script setup lang="ts">
// Create an account. A new account gets its own household; people invited to one join it from /invite/<id> instead.
definePageMeta({ layout: "auth" })
useHead({ title: "Create an account" })

const route = useRoute()
const { $auth } = useNuxtApp()
const session = useAuthSession()
const state = reactive({ name: "", email: "", password: "" })
const reveal = ref(false)
const pending = ref(false)
const error = ref("")
const refused = ref(false)
// The demo never creates accounts (the server refuses too); visitors enter its household from /login.
const demo = useDemo()

function validate(values: typeof state) {
  const errors: Array<{ name: string; message: string }> = []
  if (!values.name.trim()) errors.push({ name: "name", message: "Tell us what to call you." })
  if (values.password && values.password.length < 10) errors.push({ name: "password", message: "Use at least 10 characters." })
  return errors
}

async function submit() {
  pending.value = true
  error.value = ""
  refused.value = false
  try {
    const { error: failure } = await $auth.signUp.email({ name: state.name.trim(), email: state.email.trim(), password: state.password })
    if (failure) {
      if (/already exists/i.test(failure.message ?? "") || failure.code === "USER_ALREADY_EXISTS") {
        throw new Error("There’s already an account with this email. Sign in instead.")
      }
      // The server's user hook refuses emails outside FINANCE_ALLOWED_EMAILS that no household invited.
      if (failure.status === 422 || failure.status === 403 || /create user/i.test(failure.message ?? "")) {
        refused.value = true
        return
      }
      throw new Error(failure.message)
    }
    await session.refresh()
    await navigateTo(safeRedirect(route.query.redirect))
  } catch (cause) {
    error.value = errorText(cause, "Couldn’t create the account. Try again.")
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="text-lg font-semibold text-highlighted">Create your account</h1>
    <p class="mt-1 text-sm text-muted">You get a household of your own. Invite others to it once you’re in.</p>
    <UAlert
      v-if="demo"
      class="mt-4"
      color="neutral"
      variant="subtle"
      icon="i-lucide-lock"
      title="Sign-up is off in the demo"
      description="Explore the demo household from the sign-in page instead."
      :actions="[{ label: 'Go to sign in', to: '/login', color: 'neutral', variant: 'outline' }]"
    />

    <UForm :state="state" :validate="validate" class="mt-6 flex flex-col gap-4" @submit="submit">
      <UFormField label="Name" name="name">
        <UInput v-model="state.name" autocomplete="name" placeholder="Lucía Martín" class="w-full" required autofocus />
      </UFormField>
      <UFormField label="Email" name="email">
        <UInput v-model="state.email" type="email" autocomplete="email" placeholder="you@example.com" class="w-full" required />
      </UFormField>
      <UFormField label="Password" name="password" help="At least 10 characters.">
        <UInput
          v-model="state.password"
          :type="reveal ? 'text' : 'password'"
          autocomplete="new-password"
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
      <UAlert
        v-if="refused"
        color="neutral"
        variant="subtle"
        icon="i-lucide-lock"
        title="Sign-up is by invitation"
        description="Only allowed emails can sign up here. If someone invited you, open the link in their invitation and sign up with that email."
      />
      <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
      <UButton type="submit" block label="Create account" :loading="pending" :disabled="demo" />
    </UForm>
  </div>
  <p class="mt-6 text-center text-sm text-muted">
    Already have an account?
    <ULink :to="{ path: '/login', query: route.query.redirect ? { redirect: route.query.redirect } : {} }" class="font-medium text-highlighted underline-offset-4 hover:underline">Sign in</ULink>
  </p>
  <LegalLinks class="mt-4" />
</template>
