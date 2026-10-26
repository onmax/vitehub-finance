<script setup lang="ts">
import type { Goal } from "#shared/api"
import { GoalModal } from "#components"

// What the household is saving for: progress, dates, and how much to put aside each month to get there.
useHead({ title: "Goals" })
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
  if (saved) notify.success(goal ? "Goal saved" : "Goal created", saved.name)
}

async function remove(goal: Goal) {
  const { confirmed } = await confirm({
    title: `Delete “${goal.name}”?`,
    description: "The goal goes away. Your accounts and their money stay as they are.",
    confirmLabel: "Delete goal",
    destructive: true,
  })
  if (!confirmed) return
  try {
    await $fetch(`/api/goals/${goal.id}`, { method: "DELETE" })
    await refresh()
    notify.success("Goal deleted")
  } catch (cause) {
    notify.error(cause, "Couldn’t delete the goal")
  }
}
</script>

<template>
  <UDashboardPanel id="goals">
    <template #header>
      <PageNavbar title="Goals" :scoped="false">
        <template v-if="goals?.length" #right>
          <UButton icon="i-lucide-plus" label="New goal" class="hidden sm:inline-flex" @click="open()" />
          <UButton icon="i-lucide-plus" aria-label="New goal" class="size-10 justify-center sm:hidden" @click="open()" />
        </template>
      </PageNavbar>
    </template>

    <template #body>
      <PageError v-if="error" :error="error" title="Goals didn’t load" @retry="refresh()" />

      <div v-else-if="!goals" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div v-for="index in 3" :key="index" class="rounded-xl border border-default p-5">
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
        variant="outline"
        icon="i-lucide-target"
        title="No goals yet"
        description="Save toward something together, like an emergency fund or a trip. ViteHub Finance tells you how much to put aside each month."
        :actions="[{ label: 'Create a goal', icon: 'i-lucide-plus', onClick: () => open() }]"
      />

      <template v-else>
        <p class="text-sm text-muted">
          <Money :minor="totals.saved" :currency="currency" class="font-medium text-highlighted" /> saved of
          <Money :minor="totals.target" :currency="currency" compact />
          <template v-if="totals.monthly > 0">
            · <Money :minor="totals.monthly" :currency="currency" class="font-medium text-highlighted" /> a month keeps every goal on time
          </template>
        </p>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
