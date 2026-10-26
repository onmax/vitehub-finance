<script setup lang="ts">
import type { AccountSummary, Goal } from "#shared/api"
import { fromMinor, parseAmount, toMinor } from "#shared/money"

// Create or edit a goal. Progress comes from a linked account's balance, or from an amount you keep up to date.
const props = defineProps<{ goal?: Goal; currency: string; accounts: AccountSummary[] }>()
const emit = defineEmits<{ close: [goal?: Goal] }>()
const shared = useShared()
const { locale } = useMoney()
const plain = (minor: number) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(fromMinor(minor, props.currency))

const state = reactive({
  name: props.goal?.name ?? "",
  icon: props.goal?.icon ?? GOAL_ICONS[0]!,
  target: props.goal ? plain(props.goal.targetMinor) : "",
  targetDate: props.goal?.targetDate ?? "",
  source: (props.goal?.accountId ? "account" : "manual") as "account" | "manual",
  accountId: props.goal?.accountId ?? undefined,
  saved: props.goal ? plain(props.goal.savedMinor) : "",
  personal: props.goal ? props.goal.ownerId !== null : false,
})
const pending = ref(false)
const error = ref("")
const accountItems = computed(() =>
  props.accounts.filter((account) => !account.archived).map((account) => ({ value: account.id, label: account.name, icon: ACCOUNT_KINDS[account.kind].icon })),
)
const SOURCES = [
  { value: "account" as const, label: "Linked account" },
  { value: "manual" as const, label: "By hand" },
]

function validate(values: typeof state) {
  const errors: Array<{ name: string; message: string }> = []
  if (!values.name.trim()) errors.push({ name: "name", message: "Give the goal a name." })
  const target = parseAmount(values.target)
  if (target === null || target <= 0) errors.push({ name: "target", message: "Enter a target above zero." })
  if (values.source === "account" && !values.accountId) errors.push({ name: "accountId", message: "Pick the account you save in." })
  if (values.source === "manual" && values.saved.trim() && parseAmount(values.saved) === null)
    errors.push({ name: "saved", message: "Enter an amount like 1.500." })
  if (values.targetDate && daysFromToday(values.targetDate) < 0 && values.targetDate !== props.goal?.targetDate)
    errors.push({ name: "targetDate", message: "Pick a date from today on." })
  return errors
}

async function submit() {
  pending.value = true
  error.value = ""
  const body = {
    name: state.name.trim(),
    icon: state.icon,
    targetMinor: toMinor(parseAmount(state.target) ?? 0, props.currency),
    targetDate: state.targetDate || null,
    accountId: state.source === "account" ? (state.accountId ?? null) : null,
    savedMinor: state.source === "manual" ? toMinor(parseAmount(state.saved) ?? 0, props.currency) : undefined,
    personal: state.personal,
  }
  try {
    const saved = props.goal
      ? await $fetch<Goal>(`/api/goals/${props.goal.id}`, { method: "PATCH", body })
      : await $fetch<Goal>("/api/goals", { method: "POST", body })
    await refreshStems("goals")
    emit("close", saved)
  } catch (cause) {
    error.value = errorText(cause, "Couldn’t save the goal. Try again.")
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UModal :title="goal ? 'Edit goal' : 'New goal'" description="Something you’re saving for, and by when." @update:open="(open) => !open && emit('close')">
    <template #body>
      <UForm id="goal-form" :state="state" :validate="validate" class="flex flex-col gap-4" @submit="submit">
        <UFormField label="Name" name="name">
          <UInput v-model="state.name" placeholder="Emergency fund, Japan trip…" class="w-full" autofocus />
        </UFormField>
        <UFormField label="Icon" name="icon">
          <div role="radiogroup" aria-label="Icon" class="flex flex-wrap gap-1.5">
            <button
              v-for="icon in GOAL_ICONS"
              :key="icon"
              type="button"
              role="radio"
              :aria-checked="state.icon === icon"
              :aria-label="icon.replace('i-lucide-', '').replace(/-/g, ' ')"
              class="grid size-10 cursor-pointer place-items-center rounded-lg border transition-[color,background-color,border-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
              :class="state.icon === icon ? 'border-(--ui-border-inverted) bg-elevated text-highlighted' : 'border-default text-muted hover:bg-elevated hover:text-highlighted'"
              @click="state.icon = icon"
            >
              <UIcon :name="icon" class="size-4" />
            </button>
          </div>
        </UFormField>
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Target" name="target">
            <UInput v-model="state.target" inputmode="decimal" placeholder="10.000" class="w-full" :ui="{ base: 'tabular-nums', trailing: 'pointer-events-none' }">
              <template #trailing><span class="text-xs text-muted">{{ currency }}</span></template>
            </UInput>
          </UFormField>
          <UFormField label="By" name="targetDate" hint="Optional">
            <UInput v-model="state.targetDate" type="date" :min="today()" class="w-full" :ui="{ base: 'tabular-nums' }" />
          </UFormField>
        </div>
        <UFormField label="Track progress" name="source">
          <SegmentedControl v-model="state.source" :options="SOURCES" label="Track progress" size="sm" />
        </UFormField>
        <UFormField
          v-if="state.source === 'account'"
          label="Account"
          name="accountId"
          help="The goal’s progress is this account’s balance."
        >
          <USelectMenu
            v-model="state.accountId"
            :items="accountItems"
            value-key="value"
            placeholder="Pick an account"
            class="w-full"
            :search-input="{ placeholder: 'Search accounts…' }"
          />
        </UFormField>
        <UFormField v-else label="Saved so far" name="saved" help="Update it whenever you put money aside.">
          <UInput v-model="state.saved" inputmode="decimal" placeholder="0" class="w-full" :ui="{ base: 'tabular-nums', trailing: 'pointer-events-none' }">
            <template #trailing><span class="text-xs text-muted">{{ currency }}</span></template>
          </UInput>
        </UFormField>
        <UFormField v-if="shared" name="personal">
          <USwitch
            v-model="state.personal"
            label="Just for me"
            :description="state.personal ? 'Only you see this goal.' : 'Everyone in the household sees it.'"
          />
        </UFormField>
        <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" label="Cancel" @click="emit('close')" />
        <UButton type="submit" form="goal-form" :label="goal ? 'Save' : 'Create goal'" :loading="pending" />
      </div>
    </template>
  </UModal>
</template>
