<script setup lang="ts">
import type { AiGatewayInput, AiGatewaySettings, AiRoute, AiTestResult } from "#shared/api"

// How the household reaches Jev for AI categories: the server's key, or its own through TypeSafe, Vercel AI Gateway, or
// Cloudflare AI Gateway (server/utils/ai-gateway.ts). Only the owner changes it, in the browser; keys are sealed on the
// server and never come back, only that they're set and their last four characters. Test asks Jev one tiny question
// through what the form says, without saving it.
const { data: me, refresh: refreshMe } = useMe()
const isOwner = computed(() => me.value?.role === "owner")
const notify = useNotify()

const { data: settings, status, error: loadError, refresh } = useAsyncData(
  "household-ai",
  () => (isOwner.value ? $fetch<AiGatewaySettings>("/api/household/ai") : Promise.resolve(null)),
  { watch: [isOwner], default: () => null },
)

type Gateway = AiGatewayInput["gateway"]
const state = reactive({ gateway: "server" as Gateway, apiKey: "", accountId: "", gatewayId: "", token: "", slug: "", removeToken: false })
function reset(value: AiGatewaySettings | null) {
  if (!value) return
  Object.assign(state, {
    gateway: value.gateway === "server" && !value.server ? "typesafe" : value.gateway,
    apiKey: "",
    accountId: value.cloudflare?.accountId ?? "",
    gatewayId: value.cloudflare?.gatewayId ?? "",
    token: "",
    slug: value.cloudflare?.slug ?? "",
    removeToken: false,
  })
}
watch(settings, reset, { immediate: true })

const keyKind = (gateway: Gateway) => (gateway === "vercel" ? "vercel" : "typesafe")
/** The stored key still fits this route: a TypeSafe key serves TypeSafe and Cloudflare, an AI Gateway key only Vercel. */
const storedKey = computed(() => {
  const key = settings.value?.apiKey
  return key && state.gateway !== "server" && key.kind === keyKind(state.gateway) ? key : null
})
const storedToken = computed(() => (state.gateway === "cloudflare" && !state.removeToken ? settings.value?.cloudflare?.token : null))

const routes = computed(() => {
  const server = settings.value?.server ?? null
  return [
    {
      value: "server",
      label: translate("aiRouteServer"),
      description: server ? translate("aiRouteServerHelp", { route: AI_ROUTE_NAMES[server] }) : translate("aiRouteServerNone"),
      disabled: !server,
    },
    { value: "typesafe", label: AI_ROUTE_NAMES.typesafe, description: translate("aiRouteTypesafeHelp") },
    { value: "vercel", label: AI_ROUTE_NAMES.vercel, description: translate("aiRouteVercelHelp") },
    { value: "cloudflare", label: AI_ROUTE_NAMES.cloudflare, description: translate("aiRouteCloudflareHelp") },
  ]
})

function validate(values: typeof state) {
  const errors: Array<{ name: string; message: string }> = []
  if (values.gateway === "server") return errors
  if (!values.apiKey.trim() && !storedKey.value) errors.push({ name: "apiKey", message: translate("errorPasteAnApiKey") })
  if (values.gateway === "cloudflare") {
    if (!values.accountId.trim()) errors.push({ name: "accountId", message: translate("enterTheAccountId") })
    if (!values.gatewayId.trim()) errors.push({ name: "gatewayId", message: translate("enterTheGatewayId") })
  }
  return errors
}

function input(): AiGatewayInput {
  const apiKey = state.apiKey.trim() || undefined
  if (state.gateway === "server") return { gateway: "server" }
  if (state.gateway !== "cloudflare") return { gateway: state.gateway, apiKey }
  return {
    gateway: "cloudflare",
    apiKey,
    accountId: state.accountId.trim(),
    gatewayId: state.gatewayId.trim(),
    token: state.removeToken ? null : state.token.trim() || undefined,
    slug: state.slug.trim() || undefined,
  }
}

const saving = ref(false)
const error = ref("")
async function save() {
  saving.value = true
  error.value = ""
  try {
    settings.value = await $fetch<AiGatewaySettings>("/api/household/ai", { method: "PUT", body: input() })
    await refreshMe()
    notify.success(translate("aiSettingsSaved"))
  } catch (cause) {
    error.value = errorText(cause, translate("couldnTSaveTryAgain"))
  } finally {
    saving.value = false
  }
}

const form = useTemplateRef("form")
const testing = ref(false)
const tested = ref<AiTestResult | null>(null)
watch(() => ({ ...state }), () => (tested.value = null), { deep: true })
// A TypeSafe key and an AI Gateway key aren't interchangeable: switching between them starts the key over.
watch(
  () => state.gateway,
  (next, previous) => {
    if (next !== "server" && previous !== "server" && keyKind(next) !== keyKind(previous)) state.apiKey = ""
  },
)
async function test() {
  try {
    await form.value?.validate({})
  } catch {
    return
  }
  testing.value = true
  error.value = ""
  try {
    tested.value = await $fetch<AiTestResult>("/api/household/ai/test", { method: "POST", body: input() })
  } catch (cause) {
    error.value = errorText(cause, translate("somethingWentWrongTryAgain"))
  } finally {
    testing.value = false
  }
}

const routeName = (route: AiRoute | null | undefined) => (route ? AI_ROUTE_NAMES[route] : null)
</script>

<template>
  <SettingsSection v-if="!isOwner" :title="$t('aiCategories')" :description="$t('onlyTheHouseholdSOwnerChangesThese')">
    <p class="text-sm text-muted">
      {{ me?.household.aiRoute ? $t('aiCategoriesGoThrough', { route: routeName(me.household.aiRoute) }) : $t('aiCategoriesAreOffNoKey') }}
    </p>
  </SettingsSection>
  <UForm v-else ref="form" :state="state" :validate="validate" :validate-on="[]" @submit="save">
    <SettingsSection :title="$t('aiCategories')" :description="$t('aiGatewayDescription')">
      <div v-if="status === 'pending' && !settings" class="flex flex-col gap-3">
        <USkeleton v-for="index in 4" :key="index" class="h-10 w-full" />
      </div>
      <PageError v-else-if="loadError" :error="loadError" @retry="refresh()" />
      <div v-else class="flex flex-col gap-5">
        <URadioGroup v-model="state.gateway" :items="routes" :aria-label="$t('aiCategories')" />

        <template v-if="state.gateway !== 'server'">
          <UFormField
            :label="state.gateway === 'vercel' ? $t('aiGatewayApiKey') : $t('typesafeApiKey')"
            name="apiKey"
            :help="storedKey ? $t('savedKeyEndsIn', { last4: storedKey.last4 }) : state.gateway === 'vercel' ? $t('getAVercelKey') : $t('getATypesafeKey')"
          >
            <ConnectSecretInput v-model="state.apiKey" />
          </UFormField>

          <template v-if="state.gateway === 'cloudflare'">
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField :label="$t('cloudflareAccountId')" name="accountId">
                <UInput v-model="state.accountId" autocomplete="off" spellcheck="false" class="w-full" :ui="{ base: 'font-mono' }" />
              </UFormField>
              <UFormField :label="$t('cloudflareGatewayId')" name="gatewayId">
                <UInput v-model="state.gatewayId" autocomplete="off" spellcheck="false" class="w-full" :ui="{ base: 'font-mono' }" />
              </UFormField>
            </div>
            <UFormField :label="$t('cloudflareGatewayToken')" name="token" :hint="$t('optionalField')">
              <ConnectSecretInput v-model="state.token" />
              <template #help>
                <span v-if="storedToken" class="inline-flex items-center gap-1">
                  {{ $t('savedTokenEndsIn', { last4: storedToken.last4 }) }}
                  <UButton color="neutral" variant="link" size="xs" class="px-0" :label="$t('removeIt')" @click="state.removeToken = true" />
                </span>
                <span v-else-if="state.removeToken">{{ $t('theTokenGoesWhenYouSave') }}</span>
                <span v-else>{{ $t('cloudflareGatewayTokenHelp') }}</span>
              </template>
            </UFormField>
            <UFormField :label="$t('cloudflareSlug')" name="slug" :hint="$t('optionalField')" :help="$t('cloudflareSlugHelp')">
              <UInput v-model="state.slug" placeholder="typesafe" autocomplete="off" spellcheck="false" class="w-full" :ui="{ base: 'font-mono' }" />
            </UFormField>
          </template>
        </template>

        <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
        <p v-else-if="tested" class="flex items-start gap-1.5 text-sm" :class="tested.ok ? 'text-success' : 'text-error'" role="status">
          <UIcon :name="tested.ok ? 'i-lucide-circle-check' : 'i-lucide-circle-x'" class="mt-0.5 size-4 shrink-0" />
          <span class="min-w-0 [overflow-wrap:anywhere]">{{ tested.ok ? $t('jevAnsweredIn', { ms: formatCount(tested.ms) }) : $t('theTestFailed', { message: tested.message }) }}</span>
        </p>
      </div>

      <template v-if="settings" #footer>
        <UButton color="neutral" variant="outline" icon="i-lucide-sparkles" :label="$t('testIt')" :loading="testing" @click="test" />
        <UButton type="submit" color="neutral" variant="outline" :label="$t('save')" :loading="saving" />
      </template>
    </SettingsSection>
  </UForm>
</template>
