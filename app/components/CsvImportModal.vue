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
  { value: "upload", title: "File", icon: "i-lucide-upload" },
  { value: "map", title: "Columns", icon: "i-lucide-columns-3", disabled: !text.value },
  { value: "preview", title: "Preview", icon: "i-lucide-eye", disabled: !ready.value },
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
    loadError.value = "That file is over 5 MB. Export a shorter period and import it in parts."
    return
  }
  if (/\.(xlsx?|ods|pdf)$/i.test(file.name)) {
    loadError.value = "That’s not a CSV. In your bank or spreadsheet app, export or save it as CSV first."
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
    loadError.value = errorText(cause, "Couldn’t load the sample file.")
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
    loadError.value = "That file is empty."
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
      label: name || `Column ${index + 1}`,
      description: example ? (example.length > 28 ? `${example.slice(0, 28)}…` : example) : undefined,
    }
  })
})
const optionalItems = computed(() => [{ value: NONE, label: "None" }, ...columnItems.value])
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
  { value: "auto", label: "Detect per row" },
  { value: ",", label: "Comma (1.234,56)" },
  { value: ".", label: "Point (1,234.56)" },
]
const amountModes = [
  { value: "single" as const, label: "One column" },
  { value: "split" as const, label: "Debit and credit" },
]

const missing = computed(() => {
  const list: string[] = []
  if (mapping.date === null) list.push("the date")
  if (mapping.amountMode === "single" ? mapping.amount === null : mapping.debit === null && mapping.credit === null) list.push("the amount")
  if (mapping.description === null && mapping.counterparty === null) list.push("the description")
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
    importError.value = "Choose the account these transactions belong to."
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
      `Added ${formatCount(result.added)} transaction${result.added === 1 ? "" : "s"}`,
      result.skipped ? `Skipped ${formatCount(result.skipped)}: already in the account or unreadable.` : undefined,
    )
    emit("close", result)
  } catch (cause) {
    importError.value = errorText(cause, "The import stopped. Rows imported so far stay; import the file again to add the rest.")
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
    title="Import transactions from a CSV"
    :description="account ? `Into ${account.name}${account.institution ? ` · ${account.institution}` : ''}` : 'Most banks export one from their website.'"
    :ui="{ content: 'sm:max-w-2xl', body: 'flex flex-col gap-5' }"
    @update:open="(open) => !open && emit('close')"
  >
    <template #body>
      <UStepper v-model="step" :items="steps" size="xs" color="neutral" :linear="false" class="w-full" />

      <!-- 1. The file -->
      <div v-if="step === 'upload'" class="flex flex-col gap-4">
        <UFormField v-if="!accountId" label="Into account" name="account">
          <USelectMenu
            v-model="chosenId"
            :items="editable.map((item) => ({ value: item.id, label: item.name, description: item.institution ?? undefined, icon: ACCOUNT_KINDS[item.kind].icon }))"
            value-key="value"
            placeholder="Choose an account"
            class="w-full"
          />
          <template v-if="editable.length === 0" #help>
            You need an account to import into.
            <NuxtLink to="/accounts?new=1" class="font-medium text-highlighted underline underline-offset-2" @click="emit('close')">Add a manual account</NuxtLink>
            first.
          </template>
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
            <p class="text-sm font-medium text-highlighted">Drop a CSV here</p>
            <p class="mt-1 text-sm text-muted">Comma, semicolon, or tab separated, with or without a header row.</p>
          </div>
          <UButton color="neutral" variant="outline" label="Choose a file" icon="i-lucide-upload" @click="picker.open()" />
        </div>
        <p class="text-sm text-muted">
          No export at hand?
          <button
            type="button"
            class="cursor-pointer font-medium text-highlighted underline underline-offset-2 disabled:opacity-50"
            :disabled="loading"
            @click="loadSample"
          >
            Try it with a sample file</button
          >, six months of a Spanish household’s current account.
        </p>
        <p v-if="loadError" class="text-sm text-error" role="alert">{{ loadError }}</p>
      </div>

      <!-- 2. The columns -->
      <div v-else-if="step === 'map'" class="flex flex-col gap-4">
        <div class="flex items-center gap-2 rounded-lg border border-default bg-muted px-3 py-2 text-sm">
          <UIcon name="i-lucide-file-spreadsheet" class="size-4 shrink-0 text-muted" />
          <span class="min-w-0 flex-1 truncate font-medium text-highlighted" :title="fileName">{{ fileName }}</span>
          <span class="money shrink-0 text-muted">{{ formatCount(Math.max(0, rows.length - (mapping.hasHeader ? 1 : 0))) }} rows</span>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Separator" name="delimiter">
            <USelect v-model="delimiter" :items="CSV_DELIMITERS" class="w-full" />
          </UFormField>
          <UFormField label="Header" name="header">
            <div class="flex h-9 items-center">
              <USwitch v-model="mapping.hasHeader" label="The first row names the columns" />
            </div>
          </UFormField>
          <UFormField label="Date" name="date" required>
            <USelect v-model="dateColumn" :items="columnItems" placeholder="Choose a column" class="w-full" />
          </UFormField>
          <UFormField label="Date format" name="dateFormat">
            <USelect v-model="mapping.dateFormat" :items="CSV_DATE_FORMATS" class="w-full" />
          </UFormField>
          <UFormField label="Description" name="description" required>
            <USelect v-model="descriptionColumn" :items="columnItems" placeholder="Choose a column" class="w-full" />
          </UFormField>
          <UFormField label="Counterparty" name="counterparty" hint="Optional">
            <USelect v-model="counterpartyColumn" :items="optionalItems" class="w-full" />
          </UFormField>
        </div>

        <div class="flex flex-col gap-3 rounded-lg border border-default p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-medium text-highlighted">Amount</p>
            <SegmentedControl v-model="mapping.amountMode" :options="amountModes" label="How the file shows amounts" size="sm" />
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField v-if="mapping.amountMode === 'single'" label="Amount column" name="amount" required>
              <USelect v-model="amountColumn" :items="columnItems" placeholder="Choose a column" class="w-full" />
            </UFormField>
            <template v-else>
              <UFormField label="Money out (debit)" name="debit">
                <USelect v-model="debitColumn" :items="optionalItems" class="w-full" />
              </UFormField>
              <UFormField label="Money in (credit)" name="credit">
                <USelect v-model="creditColumn" :items="optionalItems" class="w-full" />
              </UFormField>
            </template>
            <UFormField label="Decimal separator" name="decimal">
              <USelect v-model="mapping.decimal" :items="decimalItems" class="w-full" />
            </UFormField>
          </div>
          <UCheckbox
            v-if="mapping.amountMode === 'single'"
            v-model="mapping.invert"
            label="Spending shows as positive numbers"
            description="Some card exports list purchases without a minus. This flips every sign."
          />
        </div>
        <p v-if="missing.length" class="flex items-center gap-1.5 text-sm text-muted">
          <UIcon name="i-lucide-info" class="size-4 shrink-0" />
          Choose the column with {{ missing.join(" and ") }}.
        </p>
      </div>

      <!-- 3. The preview -->
      <div v-else class="flex flex-col gap-4">
        <div class="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-default bg-(--ui-border)">
          <div class="bg-default px-3 py-2.5">
            <p class="text-xs text-muted">Ready to import</p>
            <p class="money mt-0.5 text-sm font-medium text-highlighted">{{ formatCount(good.length) }} rows</p>
          </div>
          <div class="bg-default px-3 py-2.5">
            <p class="text-xs text-muted">Money in</p>
            <p class="money money-in mt-0.5 text-sm font-medium">{{ money(totals.in) }}</p>
          </div>
          <div class="bg-default px-3 py-2.5">
            <p class="text-xs text-muted">Money out</p>
            <p class="money mt-0.5 text-sm font-medium text-highlighted">{{ money(totals.out) }}</p>
          </div>
        </div>
        <p v-if="range" class="text-sm text-muted">
          From <span class="money text-default">{{ formatDate(range.from) }}</span> to
          <span class="money text-default">{{ formatDate(range.to) }}</span>. Rows already in the account are skipped.
        </p>

        <div class="overflow-x-auto rounded-lg border border-default">
          <table class="w-full text-sm">
            <caption class="sr-only">The first ten rows as they will be imported</caption>
            <thead class="bg-muted">
              <tr class="text-left text-xs text-muted">
                <th scope="col" class="w-12 px-3 py-2 font-medium">Row</th>
                <th scope="col" class="w-24 px-3 py-2 font-medium">Date</th>
                <th scope="col" class="px-3 py-2 font-medium">Description</th>
                <th scope="col" class="px-3 py-2 text-right font-medium">Amount</th>
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
                    <span class="truncate">{{ row.error }}. This row will be skipped.</span>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="bad.length" class="flex items-center gap-1.5 text-sm text-muted">
          <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 text-warning" />
          {{ formatCount(bad.length) }} row{{ bad.length === 1 ? "" : "s" }} can’t be read and will be skipped. Check the date format and columns if that’s more than a footer.
        </p>
        <UProgress v-if="importing && good.length > 500" :model-value="progress * 100" size="sm" aria-label="Import progress" />
        <p v-if="importError" class="text-sm text-error" role="alert">{{ importError }}</p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <UButton v-if="step !== 'upload'" color="neutral" variant="ghost" icon="i-lucide-arrow-left" label="Back" :disabled="importing" @click="back" />
        <span v-else />
        <div class="flex gap-2">
          <UButton color="neutral" variant="outline" label="Cancel" :disabled="importing" @click="emit('close')" />
          <UButton v-if="step === 'map'" label="Preview" trailing-icon="i-lucide-arrow-right" :disabled="!ready" @click="step = 'preview'" />
          <UButton
            v-else-if="step === 'preview'"
            :label="`Import ${formatCount(good.length)} rows`"
            :loading="importing"
            :disabled="good.length === 0"
            @click="runImport"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
