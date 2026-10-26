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
    if (failure) throw new Error(failure.message || "Couldn’t load your API keys.")
    return ((data as { apiKeys?: ApiKey[] } | null)?.apiKeys ?? []) as ApiKey[]
  },
  { default: () => [], lazy: true },
)

const EXPIRY = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
  { value: 0, label: "Never" },
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
  return values.name.trim() ? [] : [{ name: "name", message: "Name it after what will use it, like “Home server”." }]
}

async function create() {
  pending.value = true
  createError.value = ""
  try {
    const { data, error: failure } = await $auth.apiKey.create({
      name: state.name.trim(),
      expiresIn: state.days ? state.days * 86_400 : undefined,
    })
    if (failure || !data) throw new Error(failure?.message || "Couldn’t create the key.")
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
    title: `Delete “${key.name || "API key"}”?`,
    description: "Anything using it stops working at once. You can’t undo this.",
    confirmLabel: "Delete key",
    destructive: true,
  })
  if (!confirmed) return
  const { error: failure } = await $auth.apiKey.delete({ keyId: key.id })
  if (failure) return notify.error(failure, "Couldn’t delete the key")
  await refresh()
}

const expiry = (key: ApiKey) => {
  if (!key.expiresAt) return "Never expires"
  const date = new Date(key.expiresAt)
  return date.getTime() < Date.now() ? `Expired ${formatDate(date)}` : `Expires ${formatDate(date)}`
}
</script>

<template>
  <SettingsSection title="API keys" description="For scripts and agents that can’t sign in with OAuth. A key reads and changes what you can." flush>
    <template #actions>
      <UButton color="neutral" variant="outline" icon="i-lucide-plus" label="Create key" @click="startCreate" />
    </template>
    <div v-if="status === 'pending' && !keys.length" class="flex flex-col gap-3 py-4">
      <USkeleton class="h-5 w-48" />
      <USkeleton class="h-5 w-36" />
    </div>
    <div v-else-if="error" class="py-4"><PageError :error="error" @retry="refresh()" /></div>
    <p v-else-if="!keys.length" class="py-4 text-sm text-muted">No API keys. Most agents connect with OAuth above and don’t need one.</p>
    <ul v-else class="divide-y divide-default">
      <li v-for="key in keys" :key="key.id" class="flex min-h-14 items-center gap-3 py-2">
        <span class="grid size-8 shrink-0 place-items-center rounded-md bg-elevated text-muted">
          <UIcon name="i-lucide-key-round" class="size-4" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2 text-sm font-medium text-highlighted">
            <span class="truncate">{{ key.name || "API key" }}</span>
            <code class="shrink-0 rounded-sm bg-elevated px-1 font-mono text-xs font-normal text-muted">{{ key.start ?? key.prefix }}…</code>
          </p>
          <p class="truncate text-xs text-muted tabular-nums">
            {{ key.lastRequest ? `Used ${timeAgo(new Date(key.lastRequest))}` : "Never used" }} · {{ expiry(key) }}
          </p>
        </div>
        <UTooltip text="Delete key">
          <UButton color="neutral" variant="ghost" icon="i-lucide-trash-2" :aria-label="`Delete ${key.name || 'API key'}`" @click="remove(key)" />
        </UTooltip>
      </li>
    </ul>
  </SettingsSection>

  <UModal
    v-model:open="open"
    :title="created ? 'Copy your key' : 'Create an API key'"
    :description="created ? 'This is the only time it’s shown. Store it somewhere safe, like a password manager.' : 'Send it as a bearer token to the MCP server or the REST API.'"
    :dismissible="!created"
    :ui="{ content: 'max-w-md' }"
  >
    <template #body>
      <div v-if="created" class="flex flex-col gap-3">
        <CodeSnippet :code="created" label="API key" wrap />
        <UAlert color="warning" variant="subtle" icon="i-lucide-triangle-alert" title="You won’t see this key again" description="If you lose it, delete it and create a new one." />
      </div>
      <UForm v-else id="api-key-create" :state="state" :validate="validate" class="flex flex-col gap-4" @submit="create">
        <UFormField label="Name" name="name">
          <UInput v-model="state.name" placeholder="Home server, n8n…" autofocus class="w-full" />
        </UFormField>
        <UFormField label="Expires" name="days">
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
            :label="copied ? 'Copied' : 'Copy key'"
            @click="copy(created)"
          />
          <UButton label="Done" @click="open = false" />
        </template>
        <template v-else>
          <UButton color="neutral" variant="outline" label="Cancel" @click="open = false" />
          <UButton type="submit" form="api-key-create" label="Create key" :loading="pending" />
        </template>
      </div>
    </template>
  </UModal>
</template>
