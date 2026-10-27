<script setup lang="ts">
import type { ConnectionSummary, FundMatch } from "#shared/api"
import { currentFormatLocale } from "~/lib/i18n"

// MyInvestor's funds, ETFs, and pension plans: no API reaches them, so the person finds each one (Morningstar, by ISIN
// or name) and types the units MyInvestor's app shows. The server prices them before saving (`POST
// /api/connect/broker`), then every morning at Morningstar's NAV. The current account is a bank: it connects from
// /connect/banks. Connecting again replaces the list, so the dialog opens on the funds already connected.
const flow = useConnectFlow()
const demo = useDemoPerson()

interface Row extends FundMatch {
  units: string
}
const state = reactive({ funds: [] as Row[] })
// Connecting again replaces the list, so it starts from the one already connected.
const formatUnits = (value: number) => new Intl.NumberFormat(currentFormatLocale(), { maximumSignificantDigits: 10, useGrouping: false }).format(value)
onMounted(async () => {
  const mine = await $fetch<Array<FundMatch & { units: number }>>("/api/connect/myinvestor").catch(() => [])
  if (!state.funds.length) state.funds.push(...mine.map((fund) => ({ ...fund, units: formatUnits(fund.units) })))
})

const term = ref("")
const query = computed(() => term.value.trim())
const matches = ref<FundMatch[]>([])
const searching = ref(false)
const failed = ref(false)
// Only the latest search answers: an older one arriving late would replace newer results.
let latest = 0
watchDebounced(
  query,
  async (q) => {
    const search = ++latest
    failed.value = false
    if (q.length < 3) {
      matches.value = []
      return
    }
    searching.value = true
    try {
      const found = await $fetch<FundMatch[]>("/api/connect/funds", { query: { q } })
      if (search === latest) matches.value = found
    } catch {
      if (search === latest) {
        matches.value = []
        failed.value = true
      }
    } finally {
      if (search === latest) searching.value = false
    }
  },
  { debounce: 350 },
)
const symbolOf = (fund: FundMatch) => fund.isin ?? fund.id
const items = computed(() =>
  (query.value.length < 3 ? [] : matches.value).map((fund) => ({
    label: fund.name,
    description: [fund.isin, fund.currency, fund.category].filter(Boolean).join(" · "),
    disabled: state.funds.some((row) => symbolOf(row) === symbolOf(fund)),
    fund,
  })),
)

// A pick adds a row and empties the search, after the menu has written the pick's name into it: left there, the name
// searches again and reopens the list over the dialog, and the next click only closes it.
const open = ref(false)
// Always null: the menu picks, it doesn't hold a value (undefined would let it keep its own and show its name).
const picked = ref<null>(null)
function add(item: { fund: FundMatch } | null | undefined) {
  if (!item || state.funds.some((row) => symbolOf(row) === symbolOf(item.fund))) return
  state.funds.push({ ...item.fund, units: "" })
  open.value = false
  picked.value = null
  nextTick(() => {
    term.value = ""
    matches.value = []
    document.getElementById(`units-${symbolOf(item.fund)}`)?.focus()
  })
}

// Units as MyInvestor shows them: "120,53" or "120.53".
const parseUnits = (input: string) => {
  const value = Number(input.trim().replace(/\s/g, "").replace(",", "."))
  return input.trim() && Number.isFinite(value) && value > 0 ? value : null
}

const validate = (values: typeof state) => [
  ...(values.funds.length ? [] : [{ name: "search", message: translate('myinvestorAddAFund') }]),
  ...values.funds.filter((row) => parseUnits(row.units) === null).map((row) => ({ name: `units-${symbolOf(row)}`, message: translate('myinvestorUnitsLike') })),
]

async function submit() {
  if (demo.value) return
  await flow.connect(
    () =>
      $fetch<ConnectionSummary>("/api/connect/broker", {
        method: "POST",
        body: {
          provider: "myinvestor",
          funds: state.funds.map(({ id, isin, name, currency, units }) => ({ id, isin, name, currency, units: parseUnits(units)! })),
        },
      }),
    translate('myinvestorCouldNotConnect'),
  )
}
</script>

<template>
  <!-- Checked as you type and on submit, not on blur: an error appearing as focus leaves a field moves the button under the pointer. -->
  <UForm :id="flow.formId" :state="state" :validate="validate" :validate-on="['input']" :disabled="flow.pending.value" class="flex flex-col gap-4" @submit="submit">
    <p class="flex gap-2 text-sm text-pretty text-toned">
      <UIcon name="i-lucide-landmark" class="mt-0.5 size-4 shrink-0 text-muted" />
      <span>
        {{ $t('myinvestorCurrentAccount') }}
        <ULink to="/connect/banks" class="font-medium text-highlighted underline underline-offset-4">{{ $t('myinvestorConnectItAsABank') }}</ULink>
      </span>
    </p>

    <UFormField :label="$t('myinvestorFindAFund')" name="search" :help="$t('myinvestorFindHelp')">
      <UInputMenu
        v-model:search-term="term"
        v-model:open="open"
        :model-value="(picked as never)"
        :items="items"
        :loading="searching"
        ignore-filter
        :placeholder="$t('myinvestorSearchPlaceholder')"
        icon="i-lucide-search"
        trailing-icon=""
        autocomplete="off"
        spellcheck="false"
        class="w-full"
        :ui="{ itemDescription: 'font-mono text-xs' }"
        @update:model-value="add"
      >
        <template #empty>
          {{ query.length < 3 ? $t('myinvestorTypeThree') : searching ? $t('myinvestorSearching') : failed ? $t('myinvestorSearchFailed') : $t('myinvestorNoMatches') }}
        </template>
      </UInputMenu>
    </UFormField>

    <ul v-if="state.funds.length" class="flex flex-col divide-y divide-default rounded-md border border-default">
      <li v-for="(row, index) in state.funds" :key="symbolOf(row)" class="flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-3 sm:flex-nowrap">
        <div class="min-w-0 flex-1 basis-48">
          <p class="text-sm font-medium text-pretty break-words text-highlighted">{{ row.name }}</p>
          <p class="mt-0.5 font-mono text-xs text-muted">{{ [row.isin ?? row.category ?? row.id, row.currency].join(" · ") }}</p>
        </div>
        <UFormField :name="`units-${symbolOf(row)}`" :label="$t('myinvestorUnits')" :ui="{ label: 'sr-only' }" class="w-32 shrink-0">
          <UInput :id="`units-${symbolOf(row)}`" v-model="row.units" inputmode="decimal" autocomplete="off" :placeholder="$t('myinvestorUnits')" class="w-full" :ui="{ base: 'text-base sm:text-sm tabular-nums' }" />
        </UFormField>
        <UButton icon="i-lucide-x" color="neutral" variant="ghost" :aria-label="$t('myinvestorRemove', { value1: row.name })" @click="state.funds.splice(index, 1)" />
      </li>
    </ul>

    <p class="flex gap-2 text-xs text-muted">
      <UIcon name="i-lucide-info" class="mt-px size-3.5 shrink-0" />{{ $t('myinvestorPricedBy') }}
    </p>
  </UForm>
</template>
