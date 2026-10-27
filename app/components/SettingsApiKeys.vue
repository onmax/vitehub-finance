<script setup lang="ts">
// Personal API keys for scripts and agents that can't do OAuth. A key acts as you; it's shown once, at creation.
interface ApiKey {
  id: string
  name: string | null
  start: string | null
  prefix: string | null
  createdAt: string | Date
  expiresAt: string | Date | null
  lastRequest: string | Date | null
}

const { $auth } = useNuxtApp()
const notify = useNotify()
const confirm = useConfirm()

const { data: keys, status, error, refresh } = useAsyncData<ApiKey[]>(
  "settings:api-keys",
  async () => {
    const { data, error: failure } = await $auth.apiKey.list()
    if (failure) throw Object.assign(new Error(failure.message || translate('couldnTLoadYourApiKeys')), { code: failure.code })
    return ((data as { apiKeys?: ApiKey[] } | null)?.apiKeys ?? []) as ApiKey[]
  },
  { default: () => [], lazy: true },
)

const EXPIRY = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
  { value: 0, get label() { return translate('never') } },
]
const open = ref(false)
const state = reactive({ name: "", days: 90 })
const created = ref<string | null>(null)
const pending = ref(false)
const createError = ref("")
const { copy, copied } = useClipboard({ copiedDuring: 1500, legacy: true })

function startCreate() {
  state.name = ""
  state.days = 90
  created.value = null
  createError.value = ""
  open.value = true
}

function validate(values: typeof state) {
  return values.name.trim() ? [] : [{ name: "name", message: translate('nameItAfterWhatWillUseItLikeHomeServer') }]
}

async function create() {
  pending.value = true
  createError.value = ""
  try {
    const { data, error: failure } = await $auth.apiKey.create({
      name: state.name.trim(),
      expiresIn: state.days ? state.days * 86_400 : undefined,
    })
    if (failure || !data) throw Object.assign(new Error(failure?.message || translate('couldnTCreateTheKey')), { code: failure?.code })
    created.value = (data as { key: string }).key
    await refresh()
  } catch (cause) {
    createError.value = errorText(cause)
  } finally {
    pending.value = false
  }
}

async function remove(key: ApiKey) {
  const { confirmed } = await confirm({
    title: translate('delete3', { value1: key.name || translate('apiKey') }),
    get description() { return translate('anythingUsingItStopsWorkingAtOnceYouCanT') },
    confirmLabel: translate('deleteKey'),
    destructive: true,
  })
  if (!confirmed) return
  const { error: failure } = await $auth.apiKey.delete({ keyId: key.id })
  if (failure) return notify.error(failure, translate('couldnTDeleteTheKey'))
  await refresh()
}

const expiry = (key: ApiKey) => {
  if (!key.expiresAt) return translate('neverExpires')
  const date = new Date(key.expiresAt)
  return date.getTime() < Date.now() ? translate('expired', { value1: formatDate(date) }) : translate('expires2', { value1: formatDate(date) })
}
</script>

<template>
  <SettingsSection :title="$t('apiKeys')" :description="$t('forScriptsAndAgentsThatCanTSignInWith')" flush>
    <template #actions>
      <UButton color="neutral" variant="outline" icon="i-lucide-plus" :label="$t('createKey')" @click="startCreate" />
    </template>
    <div v-if="status === 'pending' && !keys.length" class="flex flex-col gap-3 py-4">
      <USkeleton class="h-5 w-48" />
      <USkeleton class="h-5 w-36" />
    </div>
    <div v-else-if="error" class="py-4"><PageError :error="error" @retry="refresh()" /></div>
    <p v-else-if="!keys.length" class="py-4 text-sm text-muted">{{ $t('noApiKeysMostAgentsConnectWithOauthAboveAnd') }}</p>
    <ul v-else class="divide-y divide-default">
      <li v-for="key in keys" :key="key.id" class="flex min-h-14 items-center gap-3 py-2">
        <span class="grid size-8 shrink-0 place-items-center rounded-md bg-elevated text-muted">
          <UIcon name="i-lucide-key-round" class="size-4" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2 text-sm font-medium text-highlighted">
            <span class="truncate">{{ key.name || translate('apiKey') }}</span>
            <code class="shrink-0 rounded-sm bg-elevated px-1 font-mono text-xs font-normal text-muted">{{ key.start ?? key.prefix }}…</code>
          </p>
          <p class="truncate text-xs text-muted tabular-nums">
            {{ key.lastRequest ? $t('used', { value1: timeAgo(new Date(key.lastRequest)) }) : $t('neverUsed') }} · {{ expiry(key) }}
          </p>
        </div>
        <UTooltip :text="$t('deleteKey')">
          <UButton color="neutral" variant="ghost" icon="i-lucide-trash-2" :aria-label="$t('delete4', { value1: key.name || $t('apiKey') })" @click="remove(key)" />
        </UTooltip>
      </li>
    </ul>
  </SettingsSection>

  <UModal
    v-model:open="open"
    :title="created ? $t('copyYourKey') : $t('createAnApiKey')"
    :description="created ? $t('thisIsTheOnlyTimeItSShownStoreIt') : $t('sendItAsABearerTokenToTheMcpServer')"
    :dismissible="!created"
    :ui="{ content: 'max-w-md' }"
  >
    <template #body>
      <div v-if="created" class="flex flex-col gap-3">
        <CodeSnippet :code="created" :label="$t('apiKey')" wrap />
        <UAlert color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="$t('youWonTSeeThisKeyAgain')" :description="$t('ifYouLoseItDeleteItAndCreateANew')" />
      </div>
      <UForm v-else id="api-key-create" :state="state" :validate="validate" class="flex flex-col gap-4" @submit="create">
        <UFormField :label="$t('name')" name="name">
          <UInput v-model="state.name" :placeholder="$t('homeServerN8n')" autofocus class="w-full" />
        </UFormField>
        <UFormField :label="$t('expires')" name="days">
          <USelect v-model="state.days" :items="EXPIRY" class="w-full" />
        </UFormField>
        <p v-if="createError" class="text-sm text-error" role="alert">{{ createError }}</p>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <template v-if="created">
          <UButton
            color="neutral"
            variant="outline"
            :icon="copied ? 'i-lucide-copy-check' : 'i-lucide-copy'"
            :label="copied ? $t('copied') : $t('copyKey')"
            @click="copy(created)"
          />
          <UButton :label="$t('done')" @click="open = false" />
        </template>
        <template v-else>
          <UButton color="neutral" variant="outline" :label="$t('cancel')" @click="open = false" />
          <UButton type="submit" form="api-key-create" :label="$t('createKey')" :loading="pending" />
        </template>
      </div>
    </template>
  </UModal>
</template>
