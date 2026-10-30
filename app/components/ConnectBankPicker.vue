<script setup lang="ts">
import { currentFormatLocale } from "~/lib/i18n"
import { useLocalStorage } from "@vueuse/core"
import type { Bank, ProviderInfo } from "#shared/api"
import { bankMark } from "#shared/banks"

// Banks over PSD2 through Enable Banking: pick a country, find the bank, and go to its consent page. On a ViteHub Finance without
// Enable Banking's credentials it explains the setup instead; on the demo, which links no banks, it says so and
// points at what works there.
const props = defineProps<{ error?: string | null }>()
const emit = defineEmits<{ dismissError: [] }>()
// The demo links no real banks (the server refuses); it says so instead of listing banks.
const demo = useDemoPerson()

const COUNTRIES = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT", "LV", "LI", "LT", "LU", "MT", "NL", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "GB"]
const names = computed(() => new Intl.DisplayNames(currentFormatLocale(), { type: "region" }))
const countryItems = computed(() => COUNTRIES.map((code) => ({ value: code, label: names.value.of(code) ?? code })).sort((a, b) => a.label.localeCompare(b.label, currentFormatLocale())))
const country = useLocalStorage("finance:bank-country", "ES")

const { data: providers, status: providersStatus } = useScopedFetch<ProviderInfo[]>("/api/connect/providers", {
  key: "providers",
  unscoped: true,
  default: () => [],
})
const bankProvider = computed(() => providers.value.find((provider) => provider.id === "enable_banking"))
const configured = computed(() => providersStatus.value === "success" && Boolean(bankProvider.value?.available))
const publicInstance = computed(() => bankProvider.value?.reason === "public")

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
  { id: "popular", label: translate('popularIn', { value1: names.value.of(country.value) }), banks: popular.value },
  { id: "all", label: popular.value.length ? translate('allBanks') : "", banks: shown.value },
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
    connectError.value = errorText(cause, translate('couldnTStartConnectingTryAgain', { value1: bank.name }))
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
      :title="$t('theBankDidnTConnect')"
      :description="shownError"
      close
      @update:open="(open) => !open && ((connectError = ''), emit('dismissError'))"
    />

    <div v-if="demo" class="flex items-start gap-3 rounded-lg bg-muted p-4">
      <UIcon name="i-lucide-lock" class="mt-0.5 size-4 shrink-0 text-muted" />
      <div>
        <p class="text-sm font-medium text-highlighted">{{ demoLocked() }}</p>
        <p class="mt-1 text-sm text-muted"> {{ $t('theDemoHouseholdSBanksAreFictionalOutsideTheDemo') }} <ULink to="https://enablebanking.com" target="_blank" class="font-medium text-highlighted underline underline-offset-2">Enable Banking</ULink>{{ $t('tryACsvImportOrAManualAccountInstead') }} </p>
      </div>
    </div>

    <div v-else-if="providersStatus === 'pending' || providersStatus === 'idle'" class="flex flex-col gap-2">
      <USkeleton class="h-9 w-full" />
      <USkeleton v-for="row in 3" :key="row" class="h-12 w-full" />
    </div>

    <div v-else-if="!configured && publicInstance" class="rounded-lg bg-muted p-4">
      <p class="text-sm font-medium text-highlighted">{{ $t('banksArenTAvailableOnThisServer') }}</p>
      <p class="mt-1.5 text-sm text-pretty text-muted">{{ $t('banksPublicInstanceExplanation') }}</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-file-up" :label="$t('importACsv')" to="#import" />
        <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-wallet" :label="$t('catalogWalletsAndExchanges')" to="/connect/crypto" />
        <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-trending-up" label="Interactive Brokers" to="/connect/investments#ibkr" />
      </div>
    </div>

    <div v-else-if="!configured" class="rounded-lg bg-muted p-4">
      <p class="text-sm font-medium text-highlighted">{{ $t('bankConnectionsArenTSetUpOnThisServer') }}</p>
      <p class="mt-1.5 text-sm text-muted"> {{ $t('banksConnectThrough') }} <ULink to="https://enablebanking.com" target="_blank" class="font-medium text-highlighted underline underline-offset-2">Enable Banking</ULink>{{ $t('whichIsFreeForYourOwnAccountsCreateAnApp') }} <code class="font-mono text-xs">ENABLE_BANKING_APP_ID</code> {{ $t('and') }} <code class="font-mono text-xs">ENABLE_BANKING_PRIVATE_KEY</code> {{ $t('onTheServerAndRestartItUntilThenImportA') }} </p>
      <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-wrench" :label="$t('setupOpen')" to="/docs/guides/setup" class="mt-3" />
    </div>

    <template v-else>
      <div class="flex flex-col gap-2 sm:flex-row">
        <USelectMenu
          v-model="country"
          :items="countryItems"
          value-key="value"
          :aria-label="$t('country')"
          icon="i-lucide-globe"
          :search-input="{ placeholder: $t('searchCountries') }"
          class="sm:w-52"
        />
        <UInput v-model="search" icon="i-lucide-search" :placeholder="$t('searchBanks')" :aria-label="$t('searchBanks2')" class="flex-1" />
      </div>

      <PageError v-if="banksError" :error="banksError" :title="$t('couldnTLoadTheBanks')" @retry="refresh()" />
      <div v-else-if="status === 'pending'" class="grid gap-x-12 gap-y-2 sm:grid-cols-2">
        <USkeleton v-for="row in 6" :key="row" class="h-14 w-full rounded-lg" />
      </div>
      <p v-else-if="filtered.length === 0" class="rounded-lg bg-muted p-4 text-sm text-muted">
        {{ search ? $t('noBankMatchesIn', { value1: search, value2: names.of(country) }) : $t('enableBankingListsNoBanksIn', { value1: names.of(country) }) }}
      </p>
      <template v-else>
        <template v-for="list in lists" :key="list.id">
          <div v-if="list.banks.length" class="flex flex-col gap-1">
            <h4 v-if="list.label" class="text-xs font-medium text-muted">{{ list.label }}</h4>
            <ul class="grid gap-x-12 sm:grid-cols-2" :aria-label="list.label || $t('banks')">
              <li v-for="bank in list.banks" :key="bank.name">
                <button
                  type="button"
                  class="group -mx-2 flex h-14 w-[calc(100%+1rem)] cursor-pointer items-center gap-3 rounded-lg px-2 text-left transition-colors duration-150 hover:bg-elevated/60 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-wait"
                  :disabled="connecting !== null"
                  :aria-label="$t('connect', { value1: bank.name })"
                  @click="connect(bank)"
                >
                  <InstitutionMark provider="enable_banking" :name="bank.name" :logo="bank.logo" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium text-highlighted" :title="bank.name">{{ bank.name }}</span>
                    <span v-if="bank.maxConsentDays" class="block text-xs text-muted">{{ $t('reconnectEvery') }} <span class="tabular-nums">{{ bank.maxConsentDays }}</span> {{ $t('days') }}</span>
                  </span>
                  <UIcon v-if="connecting === bank.name" name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin text-muted" />
                  <span v-else class="shrink-0 text-sm font-medium text-muted transition-colors duration-150 group-hover:text-primary">{{ $t('connect2') }}</span>
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
          :label="$t('showAllBanks', { value1: rest.length })"
          @click="showAll = true"
        />
      </template>
      <p class="text-xs text-muted"> {{ $t('youSignInAtYourBankWhichSharesReadOnly') }} </p>
    </template>
  </div>
</template>
