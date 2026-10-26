<script setup lang="ts">
/**
 * Where an MCP client's sign-in lands: Better Auth's OAuth provider sends both its login and consent steps here, with a
 * signed `oauth_query`. Signed out: sign in with a password or passkey (and the two-factor code, inline), and the
 * provider resumes the authorization by itself. Signed in: allow or deny the agent, then go back to it.
 */
definePageMeta({ layout: "auth" })
useSeoMeta({ title: "Connect an agent" })

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
    if (error) throw new Error(error.message || "Couldn’t load this agent. Start the connection again.")
    return data as { client_name?: string } | null
  },
  { server: false, watch: [loggedIn], default: () => null },
)
const agentName = computed(() => client.value?.client_name || "this agent")

// Where Allow sends the agent's access. Anyone can register an agent under any name, so the name proves nothing; the
// redirect is part of this signed link, so it is where the code really goes.
const destination = computed(() => {
  const uri = text(route.query.redirect_uri) ?? ""
  if (!URL.canParse(uri)) return null
  const url = new URL(uri)
  if (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return { local: true, label: "an app on this computer" }
  if (!["http:", "https:"].includes(url.protocol)) return { local: true, label: `the app that opens ${url.protocol} links` }
  return { local: false, label: url.host }
})

const pending = ref<"allow" | "deny" | null>(null)
const error = ref("")

async function answer(accept: boolean) {
  pending.value = accept ? "allow" : "deny"
  error.value = ""
  try {
    const { data, error: failure } = await $auth.oauth2.consent({ accept })
    if (failure) throw new Error(failure.message || "This authorization link is invalid or has expired. Start again from your agent.")
    if (!(data as { url?: string } | null)?.url) throw new Error("The agent didn’t get an answer. Start again from your agent.")
  } catch (cause) {
    error.value = errorText(cause)
    pending.value = null
  }
}

const can = [
  "Read the accounts, balances, and transactions you can see",
  "Read recurring payments, budgets, goals, and the forecast",
  "Categorize transactions and add notes where you may edit",
]
</script>

<template>
  <div class="rounded-xl border border-default bg-default p-6 shadow-xs">
    <template v-if="!valid">
      <h1 class="text-lg font-semibold text-highlighted">This link has expired</h1>
      <p class="mt-2 text-sm text-muted">Start the connection again from your agent. It opens a fresh link.</p>
    </template>

    <template v-else-if="!ready">
      <USkeleton class="h-6 w-2/3" />
      <USkeleton class="mt-3 h-4 w-full" />
      <USkeleton class="mt-6 h-10 w-full" />
    </template>

    <template v-else-if="!loggedIn">
      <h1 class="text-lg font-semibold text-highlighted">Connect an agent to Joxi</h1>
      <p class="mt-2 mb-5 text-sm text-muted">Sign in to choose whether it can read your household’s finances.</p>
      <InviteAuthForm :allow-sign-up="false" />
    </template>

    <template v-else>
      <div class="flex items-center gap-3">
        <span class="grid size-10 shrink-0 place-items-center rounded-lg border border-default bg-elevated">
          <UIcon name="i-lucide-bot" class="size-5 text-toned" />
        </span>
        <h1 class="text-lg leading-snug font-semibold text-highlighted">Allow {{ agentName }} to read your household’s finances?</h1>
      </div>
      <p class="mt-4 text-sm text-muted">It acts as {{ user?.email ?? "you" }} and can:</p>
      <ul class="mt-2 flex flex-col gap-1.5 text-sm">
        <li v-for="item in can" :key="item" class="flex gap-2">
          <UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-muted" />{{ item }}
        </li>
        <li class="flex gap-2">
          <UIcon name="i-lucide-x" class="mt-0.5 size-4 shrink-0 text-muted" />Never manage people or household settings
        </li>
      </ul>
      <p v-if="destination?.local" class="mt-4 text-xs text-muted">Allow returns to {{ destination.label }}.</p>
      <UAlert
        v-else-if="destination"
        class="mt-4"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :ui="{ description: 'text-xs text-default', icon: 'text-warning' }"
      >
        <template #description>
          Allow gives this access to <span class="font-mono font-medium">{{ destination.label }}</span>. Only allow it if you started
          this connection from an agent that runs there.
        </template>
      </UAlert>
      <p class="mt-4 text-xs text-muted">Private accounts of other members stay out of its reach. Disconnect it any time in Settings › Agents.</p>
      <div class="mt-6 grid grid-cols-2 gap-2">
        <UButton block color="neutral" variant="outline" label="Deny" :disabled="pending !== null" :loading="pending === 'deny'" @click="answer(false)" />
        <UButton block label="Allow" :disabled="pending !== null" :loading="pending === 'allow'" @click="answer(true)" />
      </div>
    </template>

    <p v-if="error" class="mt-4 text-sm text-error" role="alert">{{ error }}</p>
  </div>
</template>
