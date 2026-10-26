<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import type { Bank, ProviderInfo } from "#shared/api"

// Banks over PSD2 through Enable Banking: pick a country, find the bank, and go to its consent page. On a ViteHub Finance without
// Enable Banking's credentials it explains the setup instead.
const props = defineProps<{ error?: string | null }>()
const emit = defineEmits<{ dismissError: [] }>()

const COUNTRIES = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT", "LV", "LI", "LT", "LU", "MT", "NL", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "GB"]
const names = new Intl.DisplayNames(typeof navigator === "undefined" ? undefined : navigator.language, { type: "region" })
const countryItems = COUNTRIES.map((code) => ({ value: code, label: names.of(code) ?? code })).sort((a, b) => a.label.localeCompare(b.label))
const country = useLocalStorage("finance:bank-country", "ES")

const { data: providers, status: providersStatus } = useScopedFetch<ProviderInfo[]>("/api/connect/providers", {
  key: "providers",
  unscoped: true,
  default: () => [],
})
const available = computed(() => providers.value.find((provider) => provider.id === "enable_banking")?.available ?? false)
const configured = computed(() => providersStatus.value === "success" && available.value)

const { data: banks, status, error: banksError, refresh } = useScopedFetch<Bank[]>("/api/connect/banks", {
  key: "banks",
  unscoped: true,
  query: () => ({ country: country.value }),
  default: () => [],
  immediate: false,
})
watch(
  [configured, country],
  ([value]) => value && refresh(),
  { immediate: true },
)

const search = ref("")
const showAll = ref(false)
const filtered = computed(() => {
  const term = search.value.trim().toLocaleLowerCase()
  return term ? banks.value.filter((bank) => bank.name.toLocaleLowerCase().includes(term)) : banks.value
})
const LIMIT = 24
const shown = computed(() => (showAll.value || search.value ? filtered.value : filtered.value.slice(0, LIMIT)))
watch(country, () => ((search.value = ""), (showAll.value = false)))

const connecting = ref<string | null>(null)
const connectError = ref("")
async function connect(bank: Bank) {
  connecting.value = bank.name
  connectError.value = ""
  try {
    const { url } = await $fetch<{ url: string }>("/api/connect/bank", { method: "POST", body: { name: bank.name, country: bank.country } })
    window.location.href = url
  } catch (cause) {
    connectError.value = errorText(cause, `Couldn’t start connecting ${bank.name}. Try again.`)
    connecting.value = null
  }
}
const shownError = computed(() => connectError.value || props.error || "")
</script>

<template>
  <div class="flex flex-col gap-4">
    <UAlert
      v-if="shownError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="The bank didn’t connect"
      :description="shownError"
      close
      @update:open="(open) => !open && ((connectError = ''), emit('dismissError'))"
    />

    <div v-if="providersStatus === 'pending' || providersStatus === 'idle'" class="flex flex-col gap-2">
      <USkeleton class="h-9 w-full" />
      <USkeleton v-for="row in 3" :key="row" class="h-12 w-full" />
    </div>

    <div v-else-if="!configured" class="rounded-lg border border-dashed border-default p-4">
      <p class="text-sm font-medium text-highlighted">Bank connections aren’t set up on this ViteHub Finance</p>
      <p class="mt-1.5 text-sm text-muted">
        ViteHub Finance reads banks through <ULink to="https://enablebanking.com" target="_blank" class="font-medium text-highlighted underline underline-offset-2">Enable Banking</ULink>,
        which is free for your own accounts. Create an app there, set <code class="font-mono text-xs">ENABLE_BANKING_APP_ID</code> and
        <code class="font-mono text-xs">ENABLE_BANKING_PRIVATE_KEY</code> on the server, and restart it. Until then, import a CSV from your bank.
      </p>
    </div>

    <template v-else>
      <div class="flex flex-col gap-2 sm:flex-row">
        <USelectMenu
          v-model="country"
          :items="countryItems"
          value-key="value"
          aria-label="Country"
          icon="i-lucide-globe"
          :search-input="{ placeholder: 'Search countries…' }"
          class="sm:w-52"
        />
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search banks…" aria-label="Search banks" class="flex-1" />
      </div>

      <PageError v-if="banksError" :error="banksError" title="Couldn’t load the banks" @retry="refresh()" />
      <div v-else-if="status === 'pending'" class="grid gap-2 sm:grid-cols-2">
        <USkeleton v-for="row in 6" :key="row" class="h-14 w-full rounded-lg" />
      </div>
      <p v-else-if="filtered.length === 0" class="rounded-lg border border-dashed border-default p-4 text-sm text-muted">
        {{ search ? `No bank matches “${search}” in ${names.of(country)}.` : `Enable Banking lists no banks in ${names.of(country)}.` }}
      </p>
      <template v-else>
        <ul class="grid gap-2 sm:grid-cols-2" aria-label="Banks">
          <li v-for="bank in shown" :key="bank.name">
            <button
              type="button"
              class="group flex h-14 w-full cursor-pointer items-center gap-3 rounded-lg border border-default bg-default px-3 text-left transition-colors duration-150 hover:bg-elevated/60 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-wait"
              :disabled="connecting !== null"
              :aria-label="`Connect ${bank.name}`"
              @click="connect(bank)"
            >
              <ConnectProviderIcon provider="enable_banking" :name="bank.name" :logo="bank.logo" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-highlighted" :title="bank.name">{{ bank.name }}</span>
                <span v-if="bank.maxConsentDays" class="block text-xs text-muted">Reconnect every <span class="tabular-nums">{{ bank.maxConsentDays }}</span> days</span>
              </span>
              <UIcon v-if="connecting === bank.name" name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin text-muted" />
              <span v-else class="shrink-0 text-sm font-medium text-muted transition-colors duration-150 group-hover:text-highlighted">Connect</span>
            </button>
          </li>
        </ul>
        <UButton
          v-if="!showAll && !search && filtered.length > LIMIT"
          color="neutral"
          variant="outline"
          class="self-center"
          :label="`Show all ${filtered.length} banks`"
          @click="showAll = true"
        />
      </template>
      <p class="text-xs text-muted">
        You sign in at your bank, which shares read-only access for up to 180 days. ViteHub Finance never sees your bank password and can’t move money.
      </p>
    </template>
  </div>
</template>
