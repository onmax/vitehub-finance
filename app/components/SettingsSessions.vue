<script setup lang="ts">
// Where you're signed in: this device first, then the rest, each with a way to sign it out.
interface Session {
  id: string
  token: string
  userAgent?: string | null
  ipAddress?: string | null
  createdAt: string | Date
  updatedAt: string | Date
  expiresAt: string | Date
}

const { $auth } = useNuxtApp()
const notify = useNotify()
const confirm = useConfirm()
const { session: current } = useAuthSession()
// Every demo visitor signs in as the same people, so listing sessions would show strangers' devices; the demo turns it off
// (and Better Auth's session endpoints with it).
const demo = useDemo()

const { data: sessions, status, error, refresh } = useAsyncData<Session[]>(
  "settings:sessions",
  async () => {
    const { data, error: failure } = await $auth.listSessions()
    if (failure) throw new Error(failure.message || "Couldn’t load your sessions.")
    return (data ?? []) as Session[]
  },
  { default: () => [], lazy: true, immediate: !demo },
)
const isCurrent = (session: Session) => session.token === current.value?.token
const sorted = computed(() =>
  [...sessions.value].sort(
    (a, b) => Number(isCurrent(b)) - Number(isCurrent(a)) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  ),
)
const others = computed(() => sessions.value.filter((session) => !isCurrent(session)).length)

const busy = ref<string | null>(null)
async function revoke(session: Session) {
  busy.value = session.id
  const { error: failure } = await $auth.revokeSession({ token: session.token })
  busy.value = null
  if (failure) return notify.error(failure, "Couldn’t sign out that device")
  await refresh()
}

async function revokeOthers() {
  const { confirmed } = await confirm({
    title: `Sign out ${others.value === 1 ? "1 other device" : `${others.value} other devices`}?`,
    description: "They’ll need to sign in again. This device stays signed in.",
    confirmLabel: "Sign out others",
    destructive: true,
  })
  if (!confirmed) return
  busy.value = "others"
  const { error: failure } = await $auth.revokeOtherSessions()
  busy.value = null
  if (failure) return notify.error(failure, "Couldn’t sign out the other devices")
  await refresh()
  notify.success("Other devices signed out")
}
</script>

<template>
  <SettingsSection title="Sessions" description="Devices signed in to your account." flush>
    <template v-if="!demo" #actions>
      <UButton
        v-if="others > 0"
        color="neutral"
        variant="outline"
        label="Sign out others"
        :loading="busy === 'others'"
        @click="revokeOthers"
      />
    </template>
    <p v-if="demo" class="flex items-center gap-2 py-4 text-sm text-muted">
      <UIcon name="i-lucide-lock" class="size-4 shrink-0" />{{ DEMO_LOCKED }} Every visitor shares the demo’s sign-in.
    </p>
    <div v-else-if="status === 'pending' && !sessions.length" class="flex flex-col gap-3 py-4">
      <USkeleton class="h-5 w-56" />
      <USkeleton class="h-5 w-44" />
    </div>
    <div v-else-if="error" class="py-4"><PageError :error="error" @retry="refresh()" /></div>
    <ul v-else class="divide-y divide-default">
      <li v-for="session in sorted" :key="session.id" class="flex min-h-14 items-center gap-3 py-2">
        <span class="grid size-8 shrink-0 place-items-center rounded-md bg-elevated text-muted">
          <UIcon :name="isMobileAgent(session.userAgent) ? 'i-lucide-smartphone' : 'i-lucide-monitor'" class="size-4" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2 text-sm font-medium text-highlighted">
            <span class="truncate" :title="session.userAgent ?? undefined">{{ describeAgent(session.userAgent) }}</span>
            <UBadge v-if="isCurrent(session)" color="neutral" variant="subtle" size="sm" label="This device" />
          </p>
          <p class="truncate text-xs text-muted tabular-nums">
            <template v-if="session.ipAddress">{{ session.ipAddress }} · </template>Active {{ timeAgo(new Date(session.updatedAt)) }}
          </p>
        </div>
        <UButton
          v-if="!isCurrent(session)"
          color="neutral"
          variant="ghost"
          label="Sign out"
          :loading="busy === session.id"
          @click="revoke(session)"
        />
      </li>
    </ul>
  </SettingsSection>
</template>
