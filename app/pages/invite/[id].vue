<script setup lang="ts">
// An invitation to a household. Signed out: create an account (or sign in) with the invited email, right here. Signed
// in: see the household and who invited you, then join it and land on the overview. Signed out, the public preview
// (/api/invitations/:id) names the household, the inviter, and the email to use.
definePageMeta({ layout: "auth" })
useSeoMeta({ title: "Join a household" })

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: preview } = useFetch<{ email: string; householdName: string; inviterName: string }>(
  () => `/api/invitations/${id.value}`,
  { key: () => `invitation-preview:${id.value}`, server: false },
)
const invitedEmail = computed(() => preview.value?.email ?? (typeof route.query.email === "string" ? route.query.email : ""))
const { $auth } = useNuxtApp()
const { loggedIn, ready, user } = useAuthSession()
const mounted = useMounted()
const known = computed(() => mounted.value && ready.value)
const signOut = useSignOut()

interface InvitationView {
  id: string
  email: string
  status: string
  expiresAt: string | Date
  organizationName: string
  inviterEmail: string
}
type Problem = "invalid" | "other-email" | null

const { data: invitation, error: loadError, status, refresh } = useAsyncData(
  () => `invitation:${id.value}`,
  async () => {
    if (!loggedIn.value) return null
    const { data, error } = await $auth.organization.getInvitation({ query: { id: id.value } })
    if (error) throw Object.assign(new Error(error.message ?? "Invitation not found"), { status: error.status })
    return data as unknown as InvitationView
  },
  { server: false, watch: [loggedIn], default: () => null },
)
const problem = computed<Problem>(() => {
  if (!loadError.value) return null
  return errorStatus(loadError.value) === 403 ? "other-email" : "invalid"
})

const pending = ref<"accept" | "decline" | "switch" | null>(null)
const error = ref("")

async function accept() {
  pending.value = "accept"
  error.value = ""
  try {
    const { error: failure } = await $auth.organization.acceptInvitation({ invitationId: id.value })
    if (failure) throw new Error(failure.message ?? "Couldn’t join the household.")
    await useAuthSession().refresh()
    clearNuxtData()
    await navigateTo("/")
  } catch (cause) {
    error.value = errorText(cause, "Couldn’t join the household. Try again.")
    pending.value = null
  }
}

async function decline() {
  pending.value = "decline"
  error.value = ""
  try {
    const { error: failure } = await $auth.organization.rejectInvitation({ invitationId: id.value })
    if (failure) throw new Error(failure.message ?? "Couldn’t decline the invitation.")
    await navigateTo("/")
  } catch (cause) {
    error.value = errorText(cause)
    pending.value = null
  }
}

async function switchAccount() {
  pending.value = "switch"
  await signOut()
  await navigateTo({ path: route.path, query: route.query })
}

const expires = computed(() => (invitation.value ? formatDate(new Date(invitation.value.expiresAt)) : ""))
</script>

<template>
  <div class="rounded-xl border border-default bg-default p-6 shadow-xs">
    <template v-if="!known || (loggedIn && status === 'pending' && !invitation)">
      <USkeleton class="h-6 w-2/3" />
      <USkeleton class="mt-3 h-4 w-full" />
      <USkeleton class="mt-1.5 h-4 w-4/5" />
      <USkeleton class="mt-6 h-10 w-full" />
    </template>

    <template v-else-if="!loggedIn">
      <div class="mb-5 flex flex-col items-center gap-3 text-center">
        <span class="grid size-11 place-items-center rounded-lg border border-default bg-elevated">
          <UIcon name="i-lucide-users" class="size-5 text-toned" />
        </span>
        <div>
          <h1 class="text-lg font-semibold text-highlighted">
            {{ preview ? `${preview.inviterName} invited you to ${preview.householdName}` : "You’re invited to a household" }}
          </h1>
          <p class="mt-1.5 text-sm text-muted">
            Create your account{{ invitedEmail ? ` with ${invitedEmail}` : " with the email the invitation went to" }}, or sign in
            if you already have one. You’ll see the household before you join.
          </p>
        </div>
      </div>
      <InviteAuthForm :email="invitedEmail" initial-mode="sign-up" />
    </template>

    <template v-else-if="problem === 'other-email'">
      <h1 class="text-lg font-semibold text-highlighted">This invitation is for someone else</h1>
      <p class="mt-2 text-sm text-muted">
        You’re signed in as <span class="font-medium text-highlighted">{{ user?.email }}</span>. Sign in with the email the
        invitation went to{{ invitedEmail ? ` (${invitedEmail})` : "" }}.
      </p>
      <UButton block class="mt-6" label="Use another account" :loading="pending === 'switch'" @click="switchAccount" />
      <UButton block class="mt-2" color="neutral" variant="ghost" label="Go to my overview" to="/" />
    </template>

    <template v-else-if="problem === 'invalid' || !invitation">
      <h1 class="text-lg font-semibold text-highlighted">This invitation has expired</h1>
      <p class="mt-2 text-sm text-muted">
        Invitations work for 7 days and only once. Ask whoever invited you to send a new one from their Household page.
      </p>
      <UButton block class="mt-6" color="neutral" variant="outline" label="Go to ViteHub Finance" to="/" />
      <UButton v-if="loadError" block class="mt-2" color="neutral" variant="ghost" label="Try again" @click="refresh()" />
    </template>

    <template v-else>
      <div class="flex items-center gap-3">
        <span class="grid size-11 shrink-0 place-items-center rounded-lg border border-default bg-elevated">
          <UIcon name="i-lucide-house" class="size-5 text-toned" />
        </span>
        <div class="min-w-0">
          <h1 class="truncate text-lg font-semibold text-highlighted">Join {{ invitation.organizationName }}</h1>
          <p class="truncate text-sm text-muted">Invited by {{ invitation.inviterEmail }}</p>
        </div>
      </div>
      <ul class="mt-5 flex flex-col gap-2.5 text-sm">
        <li class="flex gap-2.5">
          <UIcon name="i-lucide-users" class="mt-0.5 size-4 shrink-0 text-muted" />
          <span class="text-pretty">You’ll see the accounts the household shares, and you can share yours.</span>
        </li>
        <li class="flex gap-2.5">
          <UIcon name="i-lucide-lock" class="mt-0.5 size-4 shrink-0 text-muted" />
          <span class="text-pretty">Private accounts stay visible only to their owner. You choose for each account you connect.</span>
        </li>
        <li class="flex gap-2.5">
          <UIcon name="i-lucide-log-out" class="mt-0.5 size-4 shrink-0 text-muted" />
          <span class="text-pretty">You can leave any time; your accounts go with you.</span>
        </li>
      </ul>
      <p class="mt-4 text-xs text-muted">
        Signed in as {{ user?.email }} · Valid until <span class="whitespace-nowrap tabular-nums">{{ expires }}</span>
      </p>
      <div class="mt-6 grid grid-cols-2 gap-2">
        <UButton block color="neutral" variant="outline" label="Decline" :loading="pending === 'decline'" :disabled="pending !== null" @click="decline" />
        <UButton block label="Join household" :loading="pending === 'accept'" :disabled="pending !== null" @click="accept" />
      </div>
    </template>

    <p v-if="error" class="mt-4 text-sm text-error" role="alert">{{ error }}</p>
  </div>
</template>
