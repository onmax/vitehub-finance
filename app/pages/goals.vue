<script setup lang="ts">
import type { Goal } from "#shared/api"
import { GoalModal } from "#components"

// What the household is saving for: progress, dates, and how much to put aside each month to get there.
useHead({ get title() { return translate('goals') } })
const { data: goals, error, refresh } = useFetch<Goal[] | null>("/api/goals", {
  key: "goals",
  default: () => null,
  lazy: true,
  transform: expectJson,
})
const { data: accounts } = useAccounts()
const { data: me } = useMe()
const currency = computed(() => me.value?.household.currency ?? "EUR")
const notify = useNotify()
const confirm = useConfirm()
const overlay = useOverlay()
const modal = overlay.create(GoalModal, { destroyOnClose: true })
const accountOf = (id: string | null) => (id ? accounts.value.find((account) => account.id === id) : undefined)

const totals = computed(() => {
  const list = goals.value ?? []
  return {
    saved: list.reduce((sum, goal) => sum + Math.min(goal.progressMinor, goal.targetMinor), 0),
    target: list.reduce((sum, goal) => sum + goal.targetMinor, 0),
    monthly: list.reduce((sum, goal) => sum + (goal.progressMinor < goal.targetMinor ? (goal.monthlyNeededMinor ?? 0) : 0), 0),
  }
})

async function open(goal?: Goal) {
  const saved = await modal.open({ goal, currency: currency.value, accounts: accounts.value }).result
  if (saved) notify.success(goal ? translate('goalSaved') : translate('goalCreated'), saved.name)
}

async function remove(goal: Goal) {
  const { confirmed } = await confirm({
    title: translate('delete3', { value1: goal.name }),
    get description() { return translate('theGoalGoesAwayYourAccountsAndTheirMoneyStay') },
    confirmLabel: translate('deleteGoal'),
    destructive: true,
  })
  if (!confirmed) return
  try {
    await $fetch(`/api/goals/${goal.id}`, { method: "DELETE" })
    await refresh()
    notify.success(translate('goalDeleted'))
  } catch (cause) {
    notify.error(cause, translate('couldnTDeleteTheGoal'))
  }
}
</script>

<template>
  <UDashboardPanel id="goals">
    <template #header>
      <PageNavbar :title="$t('goals')" :scoped="false">
        <template v-if="goals?.length" #right>
          <UButton icon="i-lucide-plus" :label="$t('newGoal')" class="hidden sm:inline-flex" @click="open()" />
          <UButton icon="i-lucide-plus" :aria-label="$t('newGoal')" class="size-10 justify-center sm:hidden" @click="open()" />
        </template>
      </PageNavbar>
    </template>

    <template #body>
      <PageError v-if="error" :error="error" :title="$t('goalsDidnTLoad')" @retry="refresh()" />

      <div v-else-if="!goals" class="grid gap-x-8 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
        <div v-for="index in 3" :key="index" class="border-t border-default pt-4">
          <div class="flex gap-3">
            <USkeleton class="size-9 rounded-lg" />
            <div class="flex-1">
              <USkeleton class="h-4 w-32" />
              <USkeleton class="mt-1.5 h-3 w-20" />
            </div>
          </div>
          <div class="mt-5 flex items-center gap-4">
            <USkeleton class="size-18 rounded-full" />
            <div>
              <USkeleton class="h-6 w-24" />
              <USkeleton class="mt-1.5 h-4 w-16" />
            </div>
          </div>
        </div>
      </div>

      <UEmpty
        v-else-if="goals.length === 0"
        variant="naked"
        icon="i-lucide-target"
        :title="$t('noGoalsYet')"
        :description="$t('saveTowardSomethingTogetherLikeAnEmergencyFundOrA')"
        :actions="[{ label: $t('createAGoal'), icon: 'i-lucide-plus', onClick: () => open() }]"
      />

      <template v-else>
        <p class="text-sm text-muted">
          <Money :minor="totals.saved" :currency="currency" class="font-medium text-highlighted" /> {{ $t('savedOf') }} <Money :minor="totals.target" :currency="currency" compact />
          <template v-if="totals.monthly > 0">
            · <Money :minor="totals.monthly" :currency="currency" class="font-medium text-highlighted" /> {{ $t('aMonthKeepsEveryGoalOnTime') }} </template>
        </p>
        <div class="grid gap-x-8 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
          <GoalCard
            v-for="goal in goals"
            :key="goal.id"
            :goal="goal"
            :account="accountOf(goal.accountId)"
            :currency="currency"
            @edit="open(goal)"
            @remove="remove(goal)"
          />
        </div>
      </template>
    </template>
  </UDashboardPanel>
</template>
