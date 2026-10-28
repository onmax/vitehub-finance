<script setup lang="ts">
/**
 * Where an MCP client's sign-in lands: Better Auth's OAuth provider sends both its login and consent steps here, with a
 * signed `oauth_query`. Signed out: sign in with a password or passkey (and the two-factor code, inline), and the
 * provider resumes the authorization by itself. Signed in: allow or deny the agent, then go back to it.
 */
definePageMeta({ layout: "auth" })
useSeoMeta({ title: () => translate('connectAnAgent') })

const route = useRoute()
const { $auth } = useNuxtApp()
const { loggedIn, user, ready: sessionKnown } = useAuthSession()
// Until the session is known, a signed-in person would see the sign-in form for a moment.
const mounted = useMounted()
const ready = computed(() => mounted.value && sessionKnown.value)

const text = (value: unknown) => (typeof value === "string" ? value : Array.isArray(value) && typeof value[0] === "string" ? value[0] : undefined)
const clientId = computed(() => text(route.query.client_id) ?? "")
const valid = computed(() => Boolean(clientId.value && route.query.sig))

// The agent's name as it registered itself ("Claude Code", "Codex"…). Readable once signed in.
const { data: client } = useAsyncData(
  "oauth-client",
  async () => {
    if (!loggedIn.value || !valid.value) return null
    const { data, error } = await $auth.oauth2.publicClient({ query: { client_id: clientId.value } })
    if (error) throw Object.assign(new Error(error.message || translate('couldnTLoadThisAgentStartTheConnectionAgain')), { code: error.code })
    return data as { client_name?: string } | null
  },
  { server: false, watch: [loggedIn], default: () => null },
)
const agentName = computed(() => client.value?.client_name || translate('thisAgent'))

// Where Allow sends the agent's access. Anyone can register an agent under any name, so the name proves nothing; the
// redirect is part of this signed link, so it is where the code really goes.
const destination = computed(() => {
  const uri = text(route.query.redirect_uri) ?? ""
  if (!URL.canParse(uri)) return null
  const url = new URL(uri)
  if (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return { local: true, get label() { return translate('anAppOnThisComputer') } }
  if (!["http:", "https:"].includes(url.protocol)) return { local: true, label: translate('theAppThatOpensLinks', { value1: url.protocol }) }
  return { local: false, label: url.host }
})

const pending = ref<"allow" | "deny" | null>(null)
const error = ref("")

async function answer(accept: boolean) {
  pending.value = accept ? "allow" : "deny"
  error.value = ""
  try {
    const { data, error: failure } = await $auth.oauth2.consent({ accept })
    if (failure) throw Object.assign(new Error(failure.message || translate('thisAuthorizationLinkIsInvalidOrHasExpiredStartAgain')), { code: failure.code })
    if (!(data as { url?: string } | null)?.url) throw new Error(translate('theAgentDidnTGetAnAnswerStartAgainFrom'))
  } catch (cause) {
    error.value = errorText(cause)
    pending.value = null
  }
}

const can = [
  translate('readTheAccountsBalancesAndTransactionsYouCanSee'),
  translate('readRecurringPaymentsBudgetsGoalsAndTheForecast'),
  translate('categorizeTransactionsAndAddNotesWhereYouMayEdit'),
  translate('addTransactionsAndManualAccountsYouGiveIt'),
]
</script>

<template>
  <div>
    <template v-if="!valid">
      <h1 class="text-lg font-semibold text-highlighted">{{ $t('thisLinkHasExpired') }}</h1>
      <p class="mt-2 text-sm text-muted">{{ $t('startTheConnectionAgainFromYourAgentItOpensA') }}</p>
    </template>

    <template v-else-if="!ready">
      <USkeleton class="h-6 w-2/3" />
      <USkeleton class="mt-3 h-4 w-full" />
      <USkeleton class="mt-6 h-10 w-full" />
    </template>

    <template v-else-if="!loggedIn">
      <h1 class="text-lg font-semibold text-highlighted">{{ $t('connectAnAgentToVitehubFinance') }}</h1>
      <p class="mt-2 mb-5 text-sm text-muted">{{ $t('signInToChooseWhetherItCanReadYourHousehold') }}</p>
      <InviteAuthForm :allow-sign-up="false" />
    </template>

    <template v-else>
      <div class="flex items-center gap-3">
        <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-elevated">
          <UIcon name="i-lucide-bot" class="size-5 text-toned" />
        </span>
        <h1 class="text-lg leading-snug font-semibold text-highlighted">{{ $t('allowToReadYourHouseholdSFinances', { value1: agentName }) }}</h1>
      </div>
      <p class="mt-4 text-sm text-muted">{{ $t('itActsAsAndCan', { value1: user?.email ?? "you" }) }}</p>
      <ul class="mt-2 flex flex-col gap-1.5 text-sm">
        <li v-for="item in can" :key="item" class="flex gap-2">
          <UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-muted" />{{ item }}
        </li>
        <li class="flex gap-2">
          <UIcon name="i-lucide-x" class="mt-0.5 size-4 shrink-0 text-muted" />{{ $t('neverDeleteShareConnectOrManagePeople') }} </li>
      </ul>
      <p v-if="destination?.local" class="mt-4 text-xs text-muted">{{ $t('allowReturnsTo', { value1: destination.label }) }}</p>
      <UAlert
        v-else-if="destination"
        class="mt-4"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :ui="{ description: 'text-xs text-default', icon: 'text-warning' }"
      >
        <template #description> {{ $t('allowGivesThisAccessTo') }} <span class="font-mono font-medium">{{ destination.label }}</span>{{ $t('onlyAllowItIfYouStartedThisConnectionFromAn') }} </template>
      </UAlert>
      <p class="mt-4 text-xs text-muted">{{ $t('itCanTSeeOtherMembersPrivateAccountsDisconnectIt') }}</p>
      <div class="mt-6 grid grid-cols-2 gap-2">
        <UButton block color="neutral" variant="outline" :label="$t('deny')" :disabled="pending !== null" :loading="pending === 'deny'" @click="answer(false)" />
        <DemoLock v-slot="{ locked }" block>
          <UButton block :label="$t('allow')" :disabled="locked || pending !== null" :loading="pending === 'allow'" @click="answer(true)" />
        </DemoLock>
      </div>
    </template>

    <p v-if="error" class="mt-4 text-sm text-error" role="alert">{{ error }}</p>
  </div>
</template>
