<script setup lang="ts">
import type { AccountSummary } from "#shared/api"

// A bank's CSV export into an account, in three steps: pick the file, say which column is which (guessed from the
// file), check ten parsed rows, then import. Rows already in the account are skipped by the server, so importing the
// same file twice adds nothing. Opened through useOverlay; closes with `{ added, skipped }`, or nothing when dismissed.
const props = defineProps<{ accountId?: string }>()
const emit = defineEmits<{ close: [result?: { added: number; skipped: number }] }>()

const { data: accounts } = useAccounts()
const editable = computed(() => accounts.value.filter((account) => account.canEdit && !account.archived))
const chosenId = ref<string | undefined>(props.accountId)
watch(
  editable,
  (list) => {
    if (!chosenId.value && list.length === 1) chosenId.value = list[0]!.id
  },
  { immediate: true },
)
const account = computed<AccountSummary | undefined>(() => accounts.value.find((item) => item.id === chosenId.value))
const currency = computed(() => account.value?.currency)

type Step = "upload" | "map" | "preview"
const step = ref<Step>("upload")
const steps = computed(() => [
  { value: "upload", get title() { return translate('file') }, icon: "i-lucide-upload" },
  { value: "map", get title() { return translate('columns') }, icon: "i-lucide-columns-3", disabled: !text.value },
  { value: "preview", get title() { return translate('preview') }, icon: "i-lucide-eye", disabled: !ready.value },
])

// Step 1: the file.
const fileName = ref("")
const text = ref("")
const loadError = ref("")
const loading = ref(false)
const zone = useTemplateRef<HTMLElement>("zone")
const { isOverDropZone } = useDropZone(zone, { onDrop: (files) => files?.[0] && void readFile(files[0]), multiple: false })
const picker = useFileDialog({ accept: ".csv,.txt,text/csv", multiple: false, reset: true })
picker.onChange((files) => files?.[0] && void readFile(files[0]))

/** Spanish banks often export Windows-1252; read UTF-8 when the bytes are valid UTF-8, else that. */
function decode(buffer: ArrayBuffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder("windows-1252").decode(buffer)
  }
}

async function readFile(file: File) {
  loadError.value = ""
  if (file.size > 5 * 1024 * 1024) {
    loadError.value = translate('thatFileIsOver5MbExportAShorterPeriod')
    return
  }
  if (/\.(xlsx?|ods|pdf)$/i.test(file.name)) {
    loadError.value = translate('thatSNotACsvInYourBankOrSpreadsheet')
    return
  }
  load(file.name, decode(await file.arrayBuffer()))
}

async function loadSample() {
  loading.value = true
  loadError.value = ""
  try {
    const sample = await $fetch<string>("/samples/household-sample.csv", { responseType: "text" })
    load("household-sample.csv", sample)
  } catch (cause) {
    loadError.value = errorText(cause, translate('couldnTLoadTheSampleFile'))
  } finally {
    loading.value = false
  }
}

const delimiter = ref<CsvDelimiter>(";")
const mapping = reactive<CsvMapping>({
  hasHeader: true,
  date: null,
  amountMode: "single",
  amount: null,
  debit: null,
  credit: null,
  description: null,
  counterparty: null,
  dateFormat: "DD/MM/YYYY",
  decimal: "auto",
  invert: false,
})

function load(name: string, content: string) {
  const suggestion = suggestCsvMapping(content)
  if (suggestion.rows.length === 0) {
    loadError.value = translate('thatFileIsEmpty')
    return
  }
  fileName.value = name
  text.value = content
  delimiter.value = suggestion.delimiter
  Object.assign(mapping, suggestion.mapping)
  step.value = "map"
}

// Step 2: the columns.
const rows = computed(() => (text.value ? parseCsv(text.value, delimiter.value) : []))
const width = computed(() => Math.max(0, ...rows.value.slice(0, 50).map((row) => row.length)))
const NONE = -1
const columnItems = computed(() => {
  const header = mapping.hasHeader ? rows.value[0] : undefined
  const sample = rows.value[mapping.hasHeader ? 1 : 0] ?? []
  return Array.from({ length: width.value }, (_, index) => {
    const name = header?.[index]?.trim()
    const example = sample[index]?.trim()
    return {
      value: index,
      label: name || translate('column', { value1: index + 1 }),
      description: example ? (example.length > 28 ? `${example.slice(0, 28)}…` : example) : undefined,
    }
  })
})
const optionalItems = computed(() => [{ value: NONE, get label() { return translate('none') } }, ...columnItems.value])
/** A column choice as the select sees it (−1 for none) and as the mapping keeps it (null). */
function column(key: "date" | "amount" | "debit" | "credit" | "description" | "counterparty") {
  return computed({
    get: () => mapping[key] ?? NONE,
    set: (value: number) => (mapping[key] = value === NONE ? null : value),
  })
}
const dateColumn = column("date")
const amountColumn = column("amount")
const debitColumn = column("debit")
const creditColumn = column("credit")
const descriptionColumn = column("description")
const counterpartyColumn = column("counterparty")

const decimalItems = [
  { value: "auto", get label() { return translate('detectPerRow') } },
  { value: ",", get label() { return translate('comma123456') } },
  { value: ".", get label() { return translate('point123456') } },
]
const amountModes = [
  { value: "single" as const, get label() { return translate('oneColumn') } },
  { value: "split" as const, get label() { return translate('debitAndCredit') } },
]

const missing = computed(() => {
  const list: string[] = []
  if (mapping.date === null) list.push(translate('theDate'))
  if (mapping.amountMode === "single" ? mapping.amount === null : mapping.debit === null && mapping.credit === null) list.push(translate('theAmount'))
  if (mapping.description === null && mapping.counterparty === null) list.push(translate('theDescription'))
  return list
})
const ready = computed(() => Boolean(text.value) && missing.value.length === 0)

// Step 3: the preview.
const parsed = computed(() => (ready.value ? mapCsvRows(rows.value, mapping) : []))
const good = computed(() => parsed.value.filter((row) => row.ok))
const bad = computed(() => parsed.value.filter((row) => !row.ok))
const preview = computed(() => parsed.value.slice(0, 10))
const range = computed(() => {
  const dates = good.value.map((row) => (row.ok ? row.row.date : "")).sort()
  return dates.length ? { from: dates[0]!, to: dates.at(-1)! } : null
})
const totals = computed(() =>
  good.value.reduce(
    (sum, row) => {
      if (!row.ok) return sum
      if (row.row.amount >= 0) sum.in += row.row.amount
      else sum.out += row.row.amount
      return sum
    },
    { in: 0, out: 0 },
  ),
)
const { format } = useMoney()
const money = (amount: number) => format(Math.round(amount * 100), currency.value, { signed: true })

// Import.
const importing = ref(false)
const importError = ref("")
const progress = ref(0)
const notify = useNotify()

async function runImport() {
  if (!chosenId.value) {
    importError.value = translate('chooseTheAccountTheseTransactionsBelongTo')
    return
  }
  importing.value = true
  importError.value = ""
  progress.value = 0
  const list = good.value.flatMap((row) => (row.ok ? [row.row] : []))
  const result = { added: 0, skipped: bad.value.length }
  try {
    for (let index = 0; index < list.length; index += 500) {
      const chunk = list.slice(index, index + 500)
      const answer = await $fetch<{ added: number; skipped: number }>(`/api/accounts/${chosenId.value}/import`, {
        method: "POST",
        body: { rows: chunk },
      })
      result.added += answer.added
      result.skipped += answer.skipped
      progress.value = Math.min(list.length, index + chunk.length) / list.length
    }
    await refreshStems("accounts", "account", "overview", "transactions", "recurring", "forecast", "budgets")
    notify.success(
      translate('addedTransaction', { count: formatCount(result.added) }, result.added),
      result.skipped ? translate('skippedThatWereAlreadyThereOrCouldnTBeRead', { value1: formatCount(result.skipped) }) : undefined,
    )
    emit("close", result)
  } catch (cause) {
    importError.value = errorText(cause, translate('theImportStoppedImportTheFileAgainToAddThe'))
  } finally {
    importing.value = false
  }
}

function back() {
  step.value = step.value === "preview" ? "map" : "upload"
}
</script>

<template>
  <UModal
    :title="$t('importTransactionsFromACsv')"
    :description="account ? $t('into', { value1: account.name, value2: account.institution ? ` · ${account.institution}` : '' }) : $t('mostBanksExportOneFromTheirWebsite')"
    :ui="{ content: 'sm:max-w-2xl', body: 'flex flex-col gap-5' }"
    @update:open="(open) => !open && emit('close')"
  >
    <template #body>
      <UStepper v-model="step" :items="steps" size="xs" color="neutral" :linear="false" class="w-full" />

      <!-- 1. The file -->
      <div v-if="step === 'upload'" class="flex flex-col gap-4">
        <UFormField v-if="!accountId" :label="$t('intoAccount')" name="account">
          <USelectMenu
            v-model="chosenId"
            :items="editable.map((item) => ({ value: item.id, label: item.name, description: item.institution ?? undefined, icon: ACCOUNT_KINDS[item.kind].icon }))"
            value-key="value"
            :placeholder="$t('chooseAnAccount')"
            class="w-full"
          />
          <template v-if="editable.length === 0" #help> {{ $t('youNeedAnAccountToImportInto') }} <NuxtLink to="/accounts?new=1" class="font-medium text-highlighted underline underline-offset-2" @click="emit('close')">{{ $t('addAManualAccount') }}</NuxtLink> {{ $t('first') }} </template>
        </UFormField>

        <div
          ref="zone"
          class="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center transition-colors duration-150"
          :class="isOverDropZone ? 'border-inverted bg-elevated' : 'border-accented'"
        >
          <span class="grid size-10 place-items-center rounded-lg border border-default bg-default shadow-xs">
            <UIcon name="i-lucide-file-spreadsheet" class="size-5 text-muted" />
          </span>
          <div>
            <p class="text-sm font-medium text-highlighted">{{ $t('dropACsvHere') }}</p>
            <p class="mt-1 text-sm text-muted">{{ $t('commaSemicolonOrTabSeparatedWithOrWithoutAHeader') }}</p>
          </div>
          <UButton color="neutral" variant="outline" :label="$t('chooseAFile')" icon="i-lucide-upload" @click="picker.open()" />
        </div>
        <p class="text-sm text-muted"> {{ $t('noExportAtHand') }} <button
            type="button"
            class="cursor-pointer font-medium text-highlighted underline underline-offset-2 disabled:opacity-50"
            :disabled="loading"
            @click="loadSample"
          > {{ $t('tryItWithASampleFile') }}</button
          >{{ $t('sixMonthsOfASpanishHouseholdSCurrentAccount') }} </p>
        <p v-if="loadError" class="text-sm text-error" role="alert">{{ loadError }}</p>
      </div>

      <!-- 2. The columns -->
      <div v-else-if="step === 'map'" class="flex flex-col gap-4">
        <div class="flex items-center gap-2 rounded-lg border border-default bg-muted px-3 py-2 text-sm">
          <UIcon name="i-lucide-file-spreadsheet" class="size-4 shrink-0 text-muted" />
          <span class="min-w-0 flex-1 truncate font-medium text-highlighted" :title="fileName">{{ fileName }}</span>
          <span class="money shrink-0 text-muted">{{ $t('rows', { value1: formatCount(Math.max(0, rows.length - (mapping.hasHeader ? 1 : 0))) }) }}</span>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :label="$t('separator')" name="delimiter">
            <USelect v-model="delimiter" :items="CSV_DELIMITERS" class="w-full" />
          </UFormField>
          <UFormField :label="$t('header')" name="header">
            <div class="flex h-9 items-center">
              <USwitch v-model="mapping.hasHeader" :label="$t('theFirstRowNamesTheColumns')" />
            </div>
          </UFormField>
          <UFormField :label="$t('date')" name="date" required>
            <USelect v-model="dateColumn" :items="columnItems" :placeholder="$t('chooseAColumn')" class="w-full" />
          </UFormField>
          <UFormField :label="$t('dateFormat')" name="dateFormat">
            <USelect v-model="mapping.dateFormat" :items="CSV_DATE_FORMATS" class="w-full" />
          </UFormField>
          <UFormField :label="$t('description')" name="description" required>
            <USelect v-model="descriptionColumn" :items="columnItems" :placeholder="$t('chooseAColumn')" class="w-full" />
          </UFormField>
          <UFormField :label="$t('counterparty')" name="counterparty" hint="Optional">
            <USelect v-model="counterpartyColumn" :items="optionalItems" class="w-full" />
          </UFormField>
        </div>

        <div class="flex flex-col gap-3 rounded-lg border border-default p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-medium text-highlighted">{{ $t('amount') }}</p>
            <SegmentedControl v-model="mapping.amountMode" :options="amountModes" :label="$t('howTheFileShowsAmounts')" size="sm" />
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField v-if="mapping.amountMode === 'single'" :label="$t('amountColumn')" name="amount" required>
              <USelect v-model="amountColumn" :items="columnItems" :placeholder="$t('chooseAColumn')" class="w-full" />
            </UFormField>
            <template v-else>
              <UFormField :label="$t('moneyOutDebit')" name="debit">
                <USelect v-model="debitColumn" :items="optionalItems" class="w-full" />
              </UFormField>
              <UFormField :label="$t('moneyInCredit')" name="credit">
                <USelect v-model="creditColumn" :items="optionalItems" class="w-full" />
              </UFormField>
            </template>
            <UFormField :label="$t('decimalSeparator')" name="decimal">
              <USelect v-model="mapping.decimal" :items="decimalItems" class="w-full" />
            </UFormField>
          </div>
          <UCheckbox
            v-if="mapping.amountMode === 'single'"
            v-model="mapping.invert"
            :label="$t('spendingShowsAsPositiveNumbers')"
            :description="$t('someCardExportsListPurchasesWithoutAMinusThisFlips')"
          />
        </div>
        <p v-if="missing.length" class="flex items-center gap-1.5 text-sm text-muted">
          <UIcon name="i-lucide-info" class="size-4 shrink-0" /> {{ $t('chooseTheColumnWith', { value1: missing.join(" and ") }) }} </p>
      </div>

      <!-- 3. The preview -->
      <div v-else class="flex flex-col gap-4">
        <div class="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-default bg-(--ui-border)">
          <div class="bg-default px-3 py-2.5">
            <p class="text-xs text-muted">{{ $t('readyToImport') }}</p>
            <p class="money mt-0.5 text-sm font-medium text-highlighted">{{ $t('rows', { value1: formatCount(good.length) }) }}</p>
          </div>
          <div class="bg-default px-3 py-2.5">
            <p class="text-xs text-muted">{{ $t('moneyIn') }}</p>
            <p class="money money-in mt-0.5 text-sm font-medium">{{ money(totals.in) }}</p>
          </div>
          <div class="bg-default px-3 py-2.5">
            <p class="text-xs text-muted">{{ $t('moneyOut') }}</p>
            <p class="money mt-0.5 text-sm font-medium text-highlighted">{{ money(totals.out) }}</p>
          </div>
        </div>
        <p v-if="range" class="text-sm text-muted"> {{ $t('from') }} <span class="money text-default">{{ formatDate(range.from) }}</span> {{ $t('to') }} <span class="money text-default">{{ formatDate(range.to) }}</span>{{ $t('rowsAlreadyInTheAccountAreSkipped') }} </p>

        <div class="overflow-x-auto rounded-lg border border-default">
          <table class="w-full text-sm">
            <caption class="sr-only">{{ $t('theFirstTenRowsAsTheyWillBeImported') }}</caption>
            <thead class="bg-muted">
              <tr class="text-left text-xs text-muted">
                <th scope="col" class="w-12 px-3 py-2 font-medium">{{ $t('row') }}</th>
                <th scope="col" class="w-24 px-3 py-2 font-medium">{{ $t('date') }}</th>
                <th scope="col" class="px-3 py-2 font-medium">{{ $t('description') }}</th>
                <th scope="col" class="px-3 py-2 text-right font-medium">{{ $t('amount') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr v-for="row in preview" :key="row.line" :class="!row.ok && 'bg-error/5'">
                <td class="money px-3 py-2 text-muted">{{ row.line }}</td>
                <template v-if="row.ok">
                  <td class="money px-3 py-2 whitespace-nowrap">{{ formatDay(row.row.date, { relative: false }) }}</td>
                  <td class="w-full max-w-0 px-3 py-2">
                    <p class="truncate text-highlighted" :title="row.row.description">{{ row.row.description }}</p>
                    <p v-if="row.row.counterparty" class="truncate text-xs text-muted">{{ row.row.counterparty }}</p>
                  </td>
                  <td class="money px-3 py-2 text-right" :class="row.row.amount > 0 ? 'money-in' : 'text-highlighted'">
                    {{ money(row.row.amount) }}
                  </td>
                </template>
                <td v-else colspan="3" class="px-3 py-2">
                  <span class="flex items-center gap-1.5 text-error">
                    <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" />
                    <span class="truncate">{{ $t('thisRowWillBeSkipped', { value1: row.error }) }}</span>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="bad.length" class="flex items-center gap-1.5 text-sm text-muted">
          <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 text-warning" /> {{ $t('rowCanTBeReadAndWillBeSkippedCheck', { count: formatCount(bad.length) }, bad.length) }} </p>
        <UProgress v-if="importing && good.length > 500" :model-value="progress * 100" size="sm" :aria-label="$t('importProgress')" />
        <p v-if="importError" class="text-sm text-error" role="alert">{{ importError }}</p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <UButton v-if="step !== 'upload'" color="neutral" variant="ghost" icon="i-lucide-arrow-left" :label="$t('back')" :disabled="importing" @click="back" />
        <span v-else />
        <div class="flex gap-2">
          <UButton color="neutral" variant="outline" :label="$t('cancel')" :disabled="importing" @click="emit('close')" />
          <UButton v-if="step === 'map'" :label="$t('preview')" trailing-icon="i-lucide-arrow-right" :disabled="!ready" @click="step = 'preview'" />
          <DemoLock v-else-if="step === 'preview'" v-slot="{ locked }">
            <UButton
              :label="$t('importRows', { value1: formatCount(good.length) })"
              :loading="importing"
              :disabled="locked || good.length === 0"
              @click="runImport"
            />
          </DemoLock>
        </div>
      </div>
    </template>
  </UModal>
</template>
