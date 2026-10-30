<script setup lang="ts">
import type { AccountKind, AccountSummary, Holding } from "#shared/api"
import { fromMinor, parseAmount, toMinor } from "#shared/money"
import { currentFormatLocale } from "~/lib/i18n"

// An account's settings: its name and kind, who in the household sees it and what they may do (owner only), whether
// it counts toward net worth, a manual account's balance (or, when it holds something like silver, each quantity) or a
// MyInvestor account's units, then
// archive and delete. Switches save at once; text fields save with their button.
const props = defineProps<{ account: AccountSummary; holdings?: Holding[] }>()
const emit = defineEmits<{ updated: [account: AccountSummary] }>()
const shared = useShared()
const notify = useNotify()
const confirm = useConfirm()
const { format } = useMoney()

const name = ref(props.account.name)
const kind = ref<AccountKind>(props.account.kind)
const balance = ref("")
watch(
  () => props.account,
  (account) => {
    name.value = account.name
    kind.value = account.kind
  },
)
const manual = computed(() => !props.account.connectionId)
// Quantities its owner types: a manual account's holdings, or MyInvestor's funds, which MyInvestor can't report.
const typed = computed(() => (manual.value || props.account.provider === "myinvestor") && Boolean(props.holdings?.length))
// A fund goes by its name and counts units; a metal by its code (XAG), which reads the same in every language.
const fund = computed(() => props.account.provider === "myinvestor")
const holdingLabel = (entry: Holding) => (fund.value && entry.name ? entry.name : entry.symbol)
const pending = ref<string | null>(null)
const errors = reactive<Record<string, string>>({})

async function save(field: string, body: Record<string, unknown>, done?: string) {
  pending.value = field
  errors[field] = ""
  try {
    const account = await $fetch<AccountSummary>(`/api/accounts/${props.account.id}`, { method: "PATCH", body })
    emit("updated", account)
    await refreshStems("accounts", "account", "overview", "forecast")
    if (done) notify.success(done)
    return true
  } catch (cause) {
    errors[field] = errorText(cause, translate('couldnTSaveTryAgain'))
    return false
  } finally {
    pending.value = null
  }
}

function saveName() {
  const value = name.value.trim()
  if (!value) {
    errors.name = translate('giveTheAccountAName')
    return
  }
  if (value !== props.account.name) void save("name", { name: value }, translate('renamed'))
}

watch(kind, (value) => value !== props.account.kind && void save("kind", { kind: value }))

async function saveBalance() {
  const amount = parseAmount(balance.value)
  if (amount === null) {
    errors.balance = translate('enterAnAmountLike123456')
    return
  }
  if (await save("balance", { balanceMinor: toMinor(amount, props.account.currency) }, translate('balanceUpdated'))) balance.value = ""
}

// A quantity rarely runs into thousands and often has three decimals (1.234 oz): its one separator is the decimal point.
const quantities = reactive<Record<string, string>>({})
const parseQuantity = (input: string) => {
  const value = Number(input.trim().replace(/\s/g, "").replace(",", "."))
  return input.trim() && Number.isFinite(value) && value >= 0 ? value : null
}
const formatQuantity = (value: number) => new Intl.NumberFormat(currentFormatLocale(), { maximumSignificantDigits: 8 }).format(value)

async function saveQuantity(symbol: string) {
  const quantity = parseQuantity(quantities[symbol] ?? "")
  if (quantity === null) {
    errors[`quantity-${symbol}`] = translate('enterAQuantityLike125')
    return
  }
  const holdings = (props.holdings ?? []).map((entry) => ({ symbol: entry.symbol, quantity: entry.symbol === symbol ? quantity : entry.quantity }))
  if (await save(`quantity-${symbol}`, { holdings }, translate('quantityUpdated'))) quantities[symbol] = ""
}

const visibility = computed({
  get: () => props.account.visibility,
  set: (value) => void save("visibility", { visibility: value }),
})
const permission = computed({
  get: () => props.account.householdPermission,
  set: (value) => void save("permission", { householdPermission: value }),
})
const includeInNetWorth = computed({
  get: () => props.account.includeInNetWorth,
  set: (value) => void save("networth", { includeInNetWorth: value }),
})

async function toggleArchive() {
  const archiving = !props.account.archived
  if (archiving) {
    const { confirmed } = await confirm({
      title: translate('archive', { value1: props.account.name }),
      get description() { return translate('itLeavesYourListsAndTotalsButKeepsItsTransactions') },
      confirmLabel: translate('archive2'),
    })
    if (!confirmed) return
  }
  await save("archive", { archived: archiving }, archiving ? translate('accountArchived') : translate('accountRestored'))
}

const deleting = ref(false)
async function remove() {
  const { confirmed } = await confirm({
    title: translate('delete', { value1: props.account.name }),
    description: translate('itsBalanceHistoryAndEveryTransactionInItAreDeleted', { value1: props.account.connectionId ? translate('connectionStays') : "" }),
    confirmLabel: translate('deleteAccount'),
    destructive: true,
  })
  if (!confirmed) return
  deleting.value = true
  try {
    await $fetch(`/api/accounts/${props.account.id}`, { method: "DELETE" })
    await refreshStems("accounts", "overview", "transactions", "recurring", "forecast")
    notify.success(translate('accountDeleted'))
    await navigateTo("/accounts")
  } catch (cause) {
    errors.delete = errorText(cause, translate('couldnTDeleteTheAccount'))
  } finally {
    deleting.value = false
  }
}

const visibilityOptions = [
  { value: "household" as const, get label() { return translate('shared') }, icon: "i-lucide-users" },
  { value: "private" as const, get label() { return translate('private') }, icon: "i-lucide-lock" },
]
const permissionOptions = [
  { value: "view" as const, get label() { return translate('view') } },
  { value: "edit" as const, get label() { return translate('edit') } },
]
</script>

<template>
  <section class="border-t border-default" aria-labelledby="account-settings">
    <h2 id="account-settings" class="flex h-12 items-center text-sm font-medium text-highlighted">{{ $t('settings') }}</h2>

    <div class="flex flex-col gap-5 pt-1">
      <template v-if="account.canEdit">
        <UFormField :label="$t('name')" name="name" :error="errors.name || undefined">
          <div class="flex gap-2">
            <UInput v-model="name" class="min-w-0 flex-1" @keydown.enter="saveName" />
            <UButton
              color="neutral"
              variant="outline"
              :label="$t('save')"
              :loading="pending === 'name'"
              :disabled="name.trim() === account.name"
              @click="saveName"
            />
          </div>
        </UFormField>
        <UFormField :label="$t('kind')" name="kind" :error="errors.kind || undefined">
          <USelect v-model="kind" :items="ACCOUNT_KIND_ITEMS" class="w-full" :loading="pending === 'kind'" />
        </UFormField>
        <template v-if="typed">
          <UFormField
            v-for="entry in holdings"
            :key="entry.symbol"
            :label="fund ? $t('unitsOf', { value1: holdingLabel(entry) }) : $t('quantityOf', { value1: holdingLabel(entry) })"
            :name="`quantity-${entry.symbol}`"
            :error="errors[`quantity-${entry.symbol}`] || undefined"
            :help="$t('holdingNow', { value1: fund ? $t('unitsCount', { value1: formatQuantity(entry.quantity) }) : `${formatQuantity(entry.quantity)} ${entry.symbol}`, value2: format(entry.valueMinor, account.currency) })"
          >
            <div class="flex gap-2">
              <UInput
                v-model="quantities[entry.symbol]"
                inputmode="decimal"
                :placeholder="formatQuantity(entry.quantity)"
                class="min-w-0 flex-1"
                :ui="{ base: 'tabular-nums' }"
                @keydown.enter="saveQuantity(entry.symbol)"
              />
              <UButton
                color="neutral"
                variant="outline"
                :label="$t('update')"
                :loading="pending === `quantity-${entry.symbol}`"
                :disabled="!quantities[entry.symbol]?.trim()"
                @click="saveQuantity(entry.symbol)"
              />
            </div>
          </UFormField>
        </template>
        <UFormField
          v-else-if="manual"
          :label="$t('updateBalance')"
          name="balance"
          :error="errors.balance || undefined"
          :help="$t('nowItSSavedAsTodaySBalanceInThe', { value1: format(account.balanceMinor, account.currency) })"
        >
          <div class="flex gap-2">
            <UInput
              v-model="balance"
              inputmode="decimal"
              :placeholder="fromMinor(account.balanceMinor, account.currency).toLocaleString(currentFormatLocale(), { useGrouping: false, maximumFractionDigits: 20 })"
              class="min-w-0 flex-1"
              :ui="{ base: 'tabular-nums' }"
              @keydown.enter="saveBalance"
            />
            <UButton color="neutral" variant="outline" :label="$t('update')" :loading="pending === 'balance'" :disabled="!balance.trim()" @click="saveBalance" />
          </div>
        </UFormField>
      </template>

      <div v-if="shared || account.canManage" class="flex flex-col gap-3">
        <template v-if="account.canManage">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-medium text-highlighted">{{ $t('whoSeesIt') }}</p>
            <SegmentedControl v-model="visibility" :options="visibilityOptions" :label="$t('whoSeesThisAccount')" size="sm" />
          </div>
          <p class="text-sm text-muted">
            {{
              account.visibility === "household"
                ? $t('everyoneInTheHouseholdSeesThisAccountItsBalanceAnd')
                : $t('onlyYouSeeThisAccountItStaysOutOfThe')
            }}
          </p>
          <template v-if="account.visibility === 'household'">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-medium text-highlighted">{{ $t('whatOthersCanDo') }}</p>
              <SegmentedControl v-model="permission" :options="permissionOptions" :label="$t('whatOthersInTheHouseholdCanDo')" size="sm" />
            </div>
            <p class="text-sm text-muted">
              {{
                account.householdPermission === "edit"
                  ? $t('theyCanAlsoCategorizeTransactionsAddNotesAndRenameIt')
                  : $t('theySeeItButCanTChangeCategoriesNotesOr')
              }}
            </p>
          </template>
          <p v-if="errors.visibility || errors.permission" class="text-sm text-error" role="alert">
            {{ errors.visibility || errors.permission }}
          </p>
        </template>
        <p v-else class="flex items-start gap-2 text-sm text-muted">
          <UIcon name="i-lucide-users" class="mt-0.5 size-4 shrink-0" /> {{ $t('sharesThisAccountWithTheHousehold', { value1: account.ownerName, value2: account.canEdit ? $t('accountEditable') : $t('accountViewOnly') }) }}
        </p>
      </div>

      <USwitch
        v-if="account.canEdit"
        v-model="includeInNetWorth"
        :label="$t('countTowardNetWorth')"
        :description="$t('turnOffForAccountsYouHoldForSomeoneElseOr')"
        :loading="pending === 'networth'"
      />
      <p v-if="errors.networth" class="text-sm text-error" role="alert">{{ errors.networth }}</p>
    </div>

    <div v-if="account.canEdit" class="mt-6 flex flex-col gap-4 border-t border-default pt-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">{{ account.archived ? $t('restoreAccount') : $t('archiveAccount') }}</p>
          <p class="text-sm text-muted">
            {{ account.archived ? $t('bringItBackIntoYourListsAndTotals') : $t('hideItFromListsAndTotalsKeepItsHistory') }}
          </p>
        </div>
        <UButton
          color="neutral"
          variant="outline"
          :icon="account.archived ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
          :label="account.archived ? $t('restore') : $t('archive2')"
          :loading="pending === 'archive'"
          @click="toggleArchive"
        />
      </div>
      <p v-if="errors.archive" class="text-sm text-error" role="alert">{{ errors.archive }}</p>
      <div v-if="account.canManage" class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">{{ $t('deleteAccount') }}</p>
          <p class="text-sm text-muted">{{ $t('removesItAndItsTransactionsForEveryone') }}</p>
        </div>
        <DemoLock v-slot="{ locked }">
          <UButton color="error" variant="outline" icon="i-lucide-trash-2" :label="$t('delete2')" :loading="deleting" :disabled="locked" @click="remove" />
        </DemoLock>
      </div>
      <p v-if="errors.delete" class="text-sm text-error" role="alert">{{ errors.delete }}</p>
    </div>
  </section>
</template>
