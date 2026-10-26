<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import type { Bank, ProviderInfo } from "#shared/api"
import { bankMark } from "#shared/banks"

// Banks over PSD2 through Enable Banking: pick a country, find the bank, and go to its consent page. On a ViteHub Finance without
// Enable Banking's credentials it explains the setup instead.
const props = defineProps<{ error?: string | null }>()
const emit = defineEmits<{ dismissError: [] }>()
// The demo links no real banks (the server refuses); it says so instead of listing banks.
const demo = useDemo()

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
// Without a search, the banks people use most (the ones shared/banks.ts has a mark for) come first, like Xero's
// "Popular in…", then the rest alphabetically.
const popular = computed(() => (search.value ? [] : filtered.value.filter((bank) => bankMark(bank.name))))
const rest = computed(() => (popular.value.length ? filtered.value.filter((bank) => !popular.value.includes(bank)) : filtered.value))
const LIMIT = 24
const shown = computed(() => (showAll.value || search.value ? rest.value : rest.value.slice(0, LIMIT)))
const lists = computed(() => [
  { id: "popular", label: `Popular in ${names.of(country.value)}`, banks: popular.value },
  { id: "all", label: popular.value.length ? "All banks" : "", banks: shown.value },
])
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

    <div v-if="demo" class="flex items-start gap-3 rounded-lg bg-muted p-4">
      <UIcon name="i-lucide-lock" class="mt-0.5 size-4 shrink-0 text-muted" />
      <div>
        <p class="text-sm font-medium text-highlighted">{{ DEMO_LOCKED }}</p>
        <p class="mt-1 text-sm text-muted">
          The demo household’s banks are fictional. On your own ViteHub Finance you pick your bank here and sign in on its page through
          <ULink to="https://enablebanking.com" target="_blank" class="font-medium text-highlighted underline underline-offset-2">Enable Banking</ULink>.
          Try a CSV import or a manual account instead.
        </p>
      </div>
    </div>

    <div v-else-if="providersStatus === 'pending' || providersStatus === 'idle'" class="flex flex-col gap-2">
      <USkeleton class="h-9 w-full" />
      <USkeleton v-for="row in 3" :key="row" class="h-12 w-full" />
    </div>

    <div v-else-if="!configured" class="rounded-lg bg-muted p-4">
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
      <p v-else-if="filtered.length === 0" class="rounded-lg bg-muted p-4 text-sm text-muted">
        {{ search ? `No bank matches “${search}” in ${names.of(country)}.` : `Enable Banking lists no banks in ${names.of(country)}.` }}
      </p>
      <template v-else>
        <template v-for="list in lists" :key="list.id">
          <div v-if="list.banks.length" class="flex flex-col gap-1">
            <h4 v-if="list.label" class="text-xs font-medium text-muted">{{ list.label }}</h4>
            <ul class="grid gap-x-4 sm:grid-cols-2" :aria-label="list.label || 'Banks'">
              <li v-for="bank in list.banks" :key="bank.name">
                <button
                  type="button"
                  class="group -mx-2 flex h-14 w-[calc(100%+1rem)] cursor-pointer items-center gap-3 rounded-lg px-2 text-left transition-colors duration-150 hover:bg-elevated/60 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-wait"
                  :disabled="connecting !== null"
                  :aria-label="`Connect ${bank.name}`"
                  @click="connect(bank)"
                >
                  <InstitutionMark provider="enable_banking" :name="bank.name" :logo="bank.logo" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium text-highlighted" :title="bank.name">{{ bank.name }}</span>
                    <span v-if="bank.maxConsentDays" class="block text-xs text-muted">Reconnect every <span class="tabular-nums">{{ bank.maxConsentDays }}</span> days</span>
                  </span>
                  <UIcon v-if="connecting === bank.name" name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin text-muted" />
                  <span v-else class="shrink-0 text-sm font-medium text-muted transition-colors duration-150 group-hover:text-primary">Connect</span>
                </button>
              </li>
            </ul>
          </div>
        </template>
        <UButton
          v-if="!showAll && !search && rest.length > LIMIT"
          color="neutral"
          variant="outline"
          class="self-center"
          :label="`Show all ${rest.length} banks`"
          @click="showAll = true"
        />
      </template>
      <p class="text-xs text-muted">
        You sign in at your bank, which shares read-only access for up to 180 days. ViteHub Finance never sees your bank password and can’t move money.
      </p>
    </template>
  </div>
</template>
