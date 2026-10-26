<script setup lang="ts">
import type { AccountKind, AccountSummary } from "#shared/api"
import { fromMinor, parseAmount, toMinor } from "#shared/money"

// An account's settings: its name and kind, who in the household sees it and what they may do (owner only), whether
// it counts toward net worth, a manual account's balance, then archive and delete. Switches save at once; text
// fields save with their button.
const props = defineProps<{ account: AccountSummary }>()
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
    errors[field] = errorText(cause, "Couldn’t save. Try again.")
    return false
  } finally {
    pending.value = null
  }
}

function saveName() {
  const value = name.value.trim()
  if (!value) {
    errors.name = "Give the account a name."
    return
  }
  if (value !== props.account.name) void save("name", { name: value }, "Renamed")
}

watch(kind, (value) => value !== props.account.kind && void save("kind", { kind: value }))

async function saveBalance() {
  const amount = parseAmount(balance.value)
  if (amount === null) {
    errors.balance = "Enter an amount like 1.234,56."
    return
  }
  if (await save("balance", { balanceMinor: toMinor(amount, props.account.currency) }, "Balance updated")) balance.value = ""
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
      title: `Archive ${props.account.name}?`,
      description: "It leaves your lists and totals but keeps its transactions. You can bring it back from Accounts › Show archived.",
      confirmLabel: "Archive",
    })
    if (!confirmed) return
  }
  await save("archive", { archived: archiving }, archiving ? "Account archived" : "Account restored")
}

const deleting = ref(false)
async function remove() {
  const { confirmed } = await confirm({
    title: `Delete ${props.account.name}?`,
    description: `Its balance history and every transaction in it are deleted for everyone in the household. This can’t be undone.${props.account.connectionId ? " The connection stays; remove it on Connect to stop syncing." : ""}`,
    confirmLabel: "Delete account",
    destructive: true,
  })
  if (!confirmed) return
  deleting.value = true
  try {
    await $fetch(`/api/accounts/${props.account.id}`, { method: "DELETE" })
    await refreshStems("accounts", "overview", "transactions", "recurring", "forecast")
    notify.success("Account deleted")
    await navigateTo("/accounts")
  } catch (cause) {
    errors.delete = errorText(cause, "Couldn’t delete the account.")
  } finally {
    deleting.value = false
  }
}

const visibilityOptions = [
  { value: "household" as const, label: "Shared", icon: "i-lucide-users" },
  { value: "private" as const, label: "Private", icon: "i-lucide-lock" },
]
const permissionOptions = [
  { value: "view" as const, label: "View" },
  { value: "edit" as const, label: "Edit" },
]
</script>

<template>
  <section class="rounded-xl border border-default bg-default shadow-xs" aria-labelledby="account-settings">
    <h2 id="account-settings" class="border-b border-default px-4 py-3 text-sm font-medium text-highlighted sm:px-5">Settings</h2>

    <div class="flex flex-col gap-5 p-4 sm:p-5">
      <template v-if="account.canEdit">
        <UFormField label="Name" name="name" :error="errors.name || undefined">
          <div class="flex gap-2">
            <UInput v-model="name" class="min-w-0 flex-1" @keydown.enter="saveName" />
            <UButton
              color="neutral"
              variant="outline"
              label="Save"
              :loading="pending === 'name'"
              :disabled="name.trim() === account.name"
              @click="saveName"
            />
          </div>
        </UFormField>
        <UFormField label="Kind" name="kind" :error="errors.kind || undefined">
          <USelect v-model="kind" :items="ACCOUNT_KIND_ITEMS" class="w-full" :loading="pending === 'kind'" />
        </UFormField>
        <UFormField
          v-if="manual"
          label="Update balance"
          name="balance"
          :error="errors.balance || undefined"
          :help="`Now ${format(account.balanceMinor, account.currency)}. ViteHub Finance records today’s balance in the history.`"
        >
          <div class="flex gap-2">
            <UInput
              v-model="balance"
              inputmode="decimal"
              :placeholder="String(fromMinor(account.balanceMinor, account.currency)).replace('.', ',')"
              class="min-w-0 flex-1"
              :ui="{ base: 'tabular-nums' }"
              @keydown.enter="saveBalance"
            />
            <UButton color="neutral" variant="outline" label="Update" :loading="pending === 'balance'" :disabled="!balance.trim()" @click="saveBalance" />
          </div>
        </UFormField>
      </template>

      <div v-if="shared || account.canManage" class="flex flex-col gap-3">
        <template v-if="account.canManage">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-medium text-highlighted">Who sees it</p>
            <SegmentedControl v-model="visibility" :options="visibilityOptions" label="Who sees this account" size="sm" />
          </div>
          <p class="text-sm text-muted">
            {{
              account.visibility === "household"
                ? "Everyone in the household sees this account, its balance, and its transactions."
                : "Only you see this account. It stays out of the household’s lists and totals."
            }}
          </p>
          <template v-if="account.visibility === 'household'">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-medium text-highlighted">What others can do</p>
              <SegmentedControl v-model="permission" :options="permissionOptions" label="What others in the household can do" size="sm" />
            </div>
            <p class="text-sm text-muted">
              {{
                account.householdPermission === "edit"
                  ? "They can also categorize transactions, add notes, and rename it. Only you change who sees it or delete it."
                  : "They see it but can’t change categories, notes, or its name."
              }}
            </p>
          </template>
          <p v-if="errors.visibility || errors.permission" class="text-sm text-error" role="alert">
            {{ errors.visibility || errors.permission }}
          </p>
        </template>
        <p v-else class="flex items-start gap-2 text-sm text-muted">
          <UIcon name="i-lucide-users" class="mt-0.5 size-4 shrink-0" />
          {{ account.ownerName }} shares this account with the household.
          {{ account.canEdit ? "You can categorize, add notes, and rename it." : "You can see it but not change it." }}
        </p>
      </div>

      <USwitch
        v-if="account.canEdit"
        v-model="includeInNetWorth"
        label="Count toward net worth"
        description="Turn off for accounts you hold for someone else, or that would count money twice."
        :loading="pending === 'networth'"
      />
      <p v-if="errors.networth" class="text-sm text-error" role="alert">{{ errors.networth }}</p>
    </div>

    <div v-if="account.canEdit" class="flex flex-col gap-3 border-t border-default p-4 sm:p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">{{ account.archived ? "Restore account" : "Archive account" }}</p>
          <p class="text-sm text-muted">
            {{ account.archived ? "Bring it back into your lists and totals." : "Hide it from lists and totals, keep its history." }}
          </p>
        </div>
        <UButton
          color="neutral"
          variant="outline"
          :icon="account.archived ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
          :label="account.archived ? 'Restore' : 'Archive'"
          :loading="pending === 'archive'"
          @click="toggleArchive"
        />
      </div>
      <p v-if="errors.archive" class="text-sm text-error" role="alert">{{ errors.archive }}</p>
      <div v-if="account.canManage" class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">Delete account</p>
          <p class="text-sm text-muted">Removes it and its transactions for everyone.</p>
        </div>
        <UButton color="error" variant="outline" icon="i-lucide-trash-2" label="Delete" :loading="deleting" @click="remove" />
      </div>
      <p v-if="errors.delete" class="text-sm text-error" role="alert">{{ errors.delete }}</p>
    </div>
  </section>
</template>
