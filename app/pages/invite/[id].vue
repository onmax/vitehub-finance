<script setup lang="ts">
// An invitation to a household. Signed out: create an account (or sign in) with the invited email, right here. Signed
// in: see the household and who invited you, then join it and land on the overview. Signed out, the public preview
// (/api/invitations/:id) names the household, the inviter, and the email to use.
definePageMeta({ layout: "auth" })
useSeoMeta({ title: () => translate('joinAHousehold') })

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
    if (error) throw Object.assign(new Error(error.message ?? translate('invitationNotFound')), { status: error.status, code: error.code })
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
    if (failure) throw Object.assign(new Error(failure.message ?? translate('couldnTJoinTheHousehold')), { code: failure.code })
    await useAuthSession().refresh()
    clearNuxtData()
    await navigateTo("/")
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTJoinTheHouseholdTryAgain'))
    pending.value = null
  }
}

async function decline() {
  pending.value = "decline"
  error.value = ""
  try {
    const { error: failure } = await $auth.organization.rejectInvitation({ invitationId: id.value })
    if (failure) throw Object.assign(new Error(failure.message ?? translate('couldnTDeclineTheInvitation')), { code: failure.code })
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
  <div>
    <template v-if="!known || (loggedIn && status === 'pending' && !invitation)">
      <USkeleton class="h-6 w-2/3" />
      <USkeleton class="mt-3 h-4 w-full" />
      <USkeleton class="mt-1.5 h-4 w-4/5" />
      <USkeleton class="mt-6 h-10 w-full" />
    </template>

    <template v-else-if="!loggedIn">
      <div class="mb-5 flex flex-col items-center gap-3 text-center">
        <span class="grid size-11 place-items-center rounded-lg bg-elevated">
          <UIcon name="i-lucide-users" class="size-5 text-toned" />
        </span>
        <div>
          <h1 class="text-lg font-semibold text-highlighted">
            {{ preview ? $t('invitedYouTo', { value1: preview.inviterName, value2: preview.householdName }) : $t('youReInvitedToAHousehold') }}
          </h1>
          <p class="mt-1.5 text-sm text-muted"> {{ invitedEmail ? $t('inviteCreateNamed', { email: invitedEmail }) : $t('inviteCreate') }} </p>
        </div>
      </div>
      <InviteAuthForm :email="invitedEmail" :invitation-id="id" initial-mode="sign-up" />
    </template>

    <template v-else-if="problem === 'other-email'">
      <h1 class="text-lg font-semibold text-highlighted">{{ $t('thisInvitationIsForSomeoneElse') }}</h1>
      <p class="mt-2 text-sm text-muted"> {{ $t('youReSignedInAs') }} <span class="font-medium text-highlighted">{{ user?.email }}</span>{{ invitedEmail ? $t('signInWith', { value1: invitedEmail }) : $t('inviteSignIn') }} </p>
      <UButton block class="mt-6" :label="$t('useAnotherAccount')" :loading="pending === 'switch'" @click="switchAccount" />
      <UButton block class="mt-2" color="neutral" variant="ghost" :label="$t('goToMyOverview')" to="/" />
    </template>

    <template v-else-if="problem === 'invalid' || !invitation">
      <h1 class="text-lg font-semibold text-highlighted">{{ $t('thisInvitationHasExpired') }}</h1>
      <p class="mt-2 text-sm text-muted"> {{ $t('invitationsWorkFor7DaysAndOnlyOnceAskWhoever') }} </p>
      <UButton block class="mt-6" color="neutral" variant="outline" :label="$t('goToVitehubFinance')" to="/" />
      <UButton v-if="loadError" block class="mt-2" color="neutral" variant="ghost" :label="$t('tryAgain')" @click="refresh()" />
    </template>

    <template v-else>
      <div class="flex items-center gap-3">
        <span class="grid size-11 shrink-0 place-items-center rounded-lg bg-elevated">
          <UIcon name="i-lucide-house" class="size-5 text-toned" />
        </span>
        <div class="min-w-0">
          <h1 class="truncate text-lg font-semibold text-highlighted">{{ $t('join', { value1: invitation.organizationName }) }}</h1>
          <p class="truncate text-sm text-muted">{{ $t('invitedBy', { value1: invitation.inviterEmail }) }}</p>
        </div>
      </div>
      <ul class="mt-5 flex flex-col gap-2.5 text-sm">
        <li class="flex gap-2.5">
          <UIcon name="i-lucide-users" class="mt-0.5 size-4 shrink-0 text-muted" />
          <span class="text-pretty">{{ $t('youLlSeeTheAccountsTheHouseholdSharesAndYou') }}</span>
        </li>
        <li class="flex gap-2.5">
          <UIcon name="i-lucide-lock" class="mt-0.5 size-4 shrink-0 text-muted" />
          <span class="text-pretty">{{ $t('privateAccountsStayVisibleOnlyToTheirOwnerYouChoose') }}</span>
        </li>
        <li class="flex gap-2.5">
          <UIcon name="i-lucide-log-out" class="mt-0.5 size-4 shrink-0 text-muted" />
          <span class="text-pretty">{{ $t('youCanLeaveAnyTimeAndYourAccountsGoWith') }}</span>
        </li>
      </ul>
      <p class="mt-4 text-xs text-muted"> {{ $t('signedInAsValidUntil', { value1: user?.email }) }} <span class="whitespace-nowrap tabular-nums">{{ expires }}</span>
      </p>
      <div class="mt-6 grid grid-cols-2 gap-2">
        <UButton block color="neutral" variant="outline" :label="$t('decline')" :loading="pending === 'decline'" :disabled="pending !== null" @click="decline" />
        <UButton block :label="$t('joinHousehold')" :loading="pending === 'accept'" :disabled="pending !== null" @click="accept" />
      </div>
    </template>

    <p v-if="error" class="mt-4 text-sm text-error" role="alert">{{ error }}</p>
  </div>
</template>
