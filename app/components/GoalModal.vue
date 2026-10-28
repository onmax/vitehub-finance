<script setup lang="ts">
import type { AccountSummary, Goal } from "#shared/api"
import { fromMinor, parseAmount, toMinor } from "#shared/money"

// Allocations reserve existing cash without moving money between bank accounts.
const props = defineProps<{ goal?: Goal; currency: string; accounts: AccountSummary[]; goals?: Goal[] }>()
const emit = defineEmits<{ close: [goal?: Goal] }>()
const shared = useShared()
const { locale } = useMoney()
const plain = (minor: number) =>
  new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2, useGrouping: false }).format(fromMinor(minor, props.currency))

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
  props.accounts.filter((account) => !account.archived && account.canEdit && (state.personal ? account.visibility === "private" : account.visibility === "household")).map((account) => ({ value: account.id, label: account.name, icon: ACCOUNT_KINDS[account.kind].icon })),
)
const selectedAccount = computed(() => props.accounts.find(account => account.id === state.accountId))
const available = computed(() => {
  if (!selectedAccount.value) return 0
  const allocated = (props.goals ?? []).filter(goal => goal.id !== props.goal?.id && goal.accountId === state.accountId && !goal.completedAt && !goal.allocationNeedsReview).reduce((sum, goal) => sum + goal.savedMinor, 0)
  return Math.max(0, selectedAccount.value.balanceBaseMinor - allocated)
})
watch(() => state.personal, () => {
  if (!accountItems.value.some(account => account.value === state.accountId)) state.accountId = undefined
})
const SOURCES = [
  { value: "account" as const, get label() { return translate('linkedAccount') } },
  { value: "manual" as const, get label() { return translate('byHand') } },
]

function validate(values: typeof state) {
  const errors: Array<{ name: string; message: string }> = []
  if (!values.name.trim()) errors.push({ name: "name", message: translate('giveTheGoalAName') })
  const target = parseAmount(values.target)
  if (target === null || target <= 0) errors.push({ name: "target", message: translate('enterATargetAboveZero') })
  if (!props.goal?.fundingUnavailable && values.source === "account" && !values.accountId) errors.push({ name: "accountId", message: translate('pickTheAccountYouSaveIn') })
  if (values.saved.trim() && (parseAmount(values.saved) === null || (parseAmount(values.saved) ?? 0) < 0))
    errors.push({ name: "saved", message: translate('enterAnAmountLike1500') })
  if (values.targetDate && daysFromToday(values.targetDate) < 0 && values.targetDate !== props.goal?.targetDate)
    errors.push({ name: "targetDate", message: translate('pickADateFromTodayOn') })
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
    savedMinor: toMinor(parseAmount(state.saved) ?? 0, props.currency),
    personal: state.personal,
    ...(props.goal?.fundingUnavailable ? { accountId: undefined, savedMinor: undefined, personal: undefined } : {}),
  }
  try {
    const saved = props.goal
      ? await $fetch<Goal>(`/api/goals/${props.goal.id}`, { method: "PATCH", body })
      : await $fetch<Goal>("/api/goals", { method: "POST", body })
    await refreshStems("goals", "forecast", "setup")
    emit("close", saved)
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTSaveTheGoalTryAgain'))
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UModal :title="goal ? $t('editGoal') : $t('newGoal')" :description="$t('somethingYouReSavingForAndByWhen')" @update:open="(open) => !open && emit('close')">
    <template #body>
      <UForm id="goal-form" :state="state" :validate="validate" class="flex flex-col gap-4" @submit="submit">
        <UFormField :label="$t('name')" name="name">
          <UInput v-model="state.name" :placeholder="$t('emergencyFundJapanTrip')" class="w-full" autofocus />
        </UFormField>
        <UFormField :label="$t('icon')" name="icon">
          <div role="radiogroup" :aria-label="$t('icon')" class="flex flex-wrap gap-1.5">
            <button
              v-for="icon in GOAL_ICONS"
              :key="icon"
              type="button"
              role="radio"
              :aria-checked="state.icon === icon"
              :aria-label="$t(`icon_${icon.replace('i-lucide-', '')}`)"
              class="grid size-10 cursor-pointer place-items-center rounded-lg border transition-[color,background-color,border-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
              :class="state.icon === icon ? 'border-(--ui-border-inverted) bg-elevated text-highlighted' : 'border-default text-muted hover:bg-elevated hover:text-highlighted'"
              @click="state.icon = icon"
            >
              <UIcon :name="icon" class="size-4" />
            </button>
          </div>
        </UFormField>
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField :label="$t('target')" name="target">
            <UInput v-model="state.target" inputmode="decimal" :placeholder="$t('amountGoalPlaceholder')" class="w-full" :ui="{ base: 'tabular-nums', trailing: 'pointer-events-none' }">
              <template #trailing><span class="text-xs text-muted">{{ currency }}</span></template>
            </UInput>
          </UFormField>
          <UFormField :label="$t('by2')" name="targetDate" :hint="$t('optionalHint')">
            <DateInput v-model="state.targetDate" :min="today()" class="w-full" :ui="{ base: 'tabular-nums' }" />
          </UFormField>
        </div>
        <p v-if="goal?.fundingUnavailable" class="text-sm text-muted">{{ $t('goalFundingUnavailable') }}</p>
        <UFormField v-if="!goal?.fundingUnavailable" :label="$t('trackProgress')" name="source">
          <SegmentedControl v-model="state.source" :options="SOURCES" :label="$t('trackProgress')" size="sm" />
        </UFormField>
        <UFormField
          v-if="!goal?.fundingUnavailable && state.source === 'account'"
          :label="$t('account')"
          name="accountId"
          :help="$t('goalAllocationAccountHelp')"
        >
          <USelectMenu
            v-model="state.accountId"
            :items="accountItems"
            value-key="value"
            :placeholder="$t('pickAnAccount')"
            class="w-full"
            :search-input="{ placeholder: $t('searchAccounts') }"
          />
        </UFormField>
        <p v-if="state.source === 'account' && selectedAccount" class="text-sm text-muted">
          {{ $t('goalAvailableToAllocate', { amount: plain(available), currency }) }}
        </p>
        <UFormField v-if="!goal?.fundingUnavailable" :label="state.source === 'account' ? $t('goalAllocatedAmount') : $t('savedSoFar')" name="saved" :help="state.source === 'account' ? $t('goalAllocationHelp') : $t('updateItWheneverYouPutMoneyAside')">
          <UInput v-model="state.saved" inputmode="decimal" placeholder="0" class="w-full" :ui="{ base: 'tabular-nums', trailing: 'pointer-events-none' }">
            <template #trailing><span class="text-xs text-muted">{{ currency }}</span></template>
          </UInput>
        </UFormField>
        <UFormField v-if="shared || accounts.some(account => account.visibility === 'private')" name="personal">
          <USwitch
            v-model="state.personal"
            :label="$t('justForMe')"
            :description="state.personal ? $t('onlyYouSeeThisGoal') : $t('everyoneInTheHouseholdSeesIt')"
          />
        </UFormField>
        <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="$t('cancel')" @click="emit('close')" />
        <DemoLock v-slot="{ locked }">
          <UButton type="submit" form="goal-form" :label="goal ? $t('save') : $t('createGoal')" :loading="pending" :disabled="locked" />
        </DemoLock>
      </div>
    </template>
  </UModal>
</template>
