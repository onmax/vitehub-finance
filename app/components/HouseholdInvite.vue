<script setup lang="ts">
// Invite someone by email, and the invitations still waiting. When the server can't send email, each invitation shows its
// link to send yourself.
const props = defineProps<{ open?: boolean }>()
const { data: me } = useMe()
const { $auth } = useNuxtApp()
const notify = useNotify()
const origin = useRequestURL().origin
const { copy, copied } = useClipboard({ copiedDuring: 1500 })
const copiedId = ref<string | null>(null)

interface Invitation {
  id: string
  email: string
  status: string
  expiresAt: string | Date
}

const { data: invitations, refresh, status } = useAsyncData(
  "invitations",
  async () => {
    if (!me.value) return []
    const { data, error } = await $auth.organization.listInvitations({ query: { organizationId: me.value.household.id } })
    if (error) throw Object.assign(new Error(error.message ?? translate('couldnTLoadTheInvitationsTryAgain')), { code: error.code })
    return ((data ?? []) as unknown as Invitation[]).filter(
      (invitation) => invitation.status === "pending" && new Date(invitation.expiresAt).getTime() > Date.now(),
    )
  },
  { server: false, default: () => [], watch: [() => me.value?.household.id] },
)

const email = ref("")
const formOpen = ref(props.open ?? false)
watch(
  () => props.open,
  (value) => value && (formOpen.value = true),
)
const sending = ref(false)
// Nobody joins the demo household (the server refuses invitations there).
const demo = useDemoPerson()
const error = ref("")
const lastLink = ref<string | null>(null)
const linkFor = (invitation: Invitation) => `${origin}/invite/${invitation.id}?email=${encodeURIComponent(invitation.email)}`

async function invite() {
  if (demo.value) return
  error.value = ""
  lastLink.value = null
  const address = email.value.trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(address)) {
    error.value = translate('enterTheirEmailAddress')
    return
  }
  sending.value = true
  try {
    const { data, error: failure } = await $auth.organization.inviteMember({
      email: address,
      role: "member",
      organizationId: me.value?.household.id,
    })
    if (failure) throw Object.assign(new Error(failure.message ?? translate('couldnTInviteThem')), { code: failure.code })
    const invitation = data as unknown as Invitation
    email.value = ""
    await refresh()
    if (me.value?.email) notify.success(translate('invitationSentTo', { value1: address }), translate('theirLinkWorksFor7Days'))
    else lastLink.value = linkFor(invitation)
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTInviteThemTryAgain'))
  } finally {
    sending.value = false
  }
}

async function cancel(invitation: Invitation) {
  const { error: failure } = await $auth.organization.cancelInvitation({ invitationId: invitation.id })
  if (failure) return notify.error(failure, translate('couldnTCancelTheInvitation'))
  if (lastLink.value?.includes(invitation.id)) lastLink.value = null
  await refresh()
}

async function copyLink(invitation: Invitation | string, id: string) {
  await copy(typeof invitation === "string" ? invitation : linkFor(invitation))
  copiedId.value = id
}
</script>

<template>
  <SettingsSection
    id="invite"
    :title="$t('inviteSomeone')"
    :description="
      me?.email
        ? $t('theyGetAnEmailWithALinkToJoinIt')
        : $t('createALinkAndSendItToThemYourselfIt')
    "
  >
    <form class="flex flex-col gap-2 sm:flex-row sm:items-start" novalidate @submit.prevent="invite">
      <UFormField :label="$t('email')" name="email" class="flex-1" :error="error || undefined" :ui="{ label: 'sr-only' }">
        <UInput v-model="email" type="email" autocomplete="off" :placeholder="$t('partnerExampleCom')" class="w-full" :autofocus="formOpen && !demo" :disabled="demo" />
      </UFormField>
      <DemoLock v-slot="{ locked }">
        <UButton
          type="submit"
          icon="i-lucide-user-plus"
          :label="me?.email ? $t('sendInvitation') : $t('createInviteLink')"
          :loading="sending"
          :disabled="locked"
          class="justify-center"
        />
      </DemoLock>
    </form>

    <div v-if="lastLink" class="mt-4 rounded-lg bg-muted p-3">
      <p class="text-sm font-medium text-highlighted">{{ $t('copyThisLinkAndSendItToThem') }}</p>
      <div class="mt-2 flex items-center gap-2">
        <code class="min-w-0 flex-1 truncate rounded-md border border-default bg-default px-2.5 py-2 font-mono text-xs" :title="lastLink">{{ lastLink }}</code>
        <UButton
          color="neutral"
          variant="outline"
          :icon="copied && copiedId === 'last' ? 'i-lucide-copy-check' : 'i-lucide-copy'"
          :label="copied && copiedId === 'last' ? $t('copied') : $t('copy2')"
          @click="copyLink(lastLink, 'last')"
        />
      </div>
    </div>

    <div v-if="invitations.length" class="mt-5">
      <h3 class="border-b border-default pb-2 text-xs font-medium text-muted">{{ $t('waitingToJoin') }}</h3>
      <ul class="divide-y divide-default">
        <li v-for="invitation in invitations" :key="invitation.id" class="flex min-h-14 items-center gap-3 py-2">
          <span class="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-default">
            <UIcon name="i-lucide-mail" class="size-4 text-muted" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm text-highlighted" :title="invitation.email">{{ invitation.email }}</p>
            <p class="text-xs text-muted">{{ $t('expires') }} <span class="tabular-nums">{{ formatDate(new Date(invitation.expiresAt)) }}</span></p>
          </div>
          <UTooltip :text="copied && copiedId === invitation.id ? $t('copied') : $t('copyInviteLink')">
            <UButton
              color="neutral"
              variant="ghost"
              :icon="copied && copiedId === invitation.id ? 'i-lucide-copy-check' : 'i-lucide-link'"
              :aria-label="$t('copyInviteLink')"
              class="size-10 justify-center"
              @click="copyLink(invitation, invitation.id)"
            />
          </UTooltip>
          <UButton color="neutral" variant="ghost" :label="$t('cancel')" class="h-10" @click="cancel(invitation)" />
        </li>
      </ul>
    </div>
    <p v-else-if="status === 'error'" class="mt-4 text-sm text-error">{{ $t('couldnTLoadTheInvitationsReloadThePageToTry') }}</p>
  </SettingsSection>
</template>
