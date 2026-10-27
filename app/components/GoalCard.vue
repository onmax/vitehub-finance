<script setup lang="ts">
import type { AccountSummary, Goal } from "#shared/api"

// A savings goal: its icon and name, a progress ring, saved of target, the date, what to put aside each month, and
// where the progress comes from (a linked account's balance, or an amount kept by hand).
const props = defineProps<{ goal: Goal; account?: AccountSummary; currency: string }>()
const emit = defineEmits<{ edit: []; remove: [] }>()
const shared = useShared()
const { format } = useMoney()
const share = computed(() => (props.goal.targetMinor > 0 ? props.goal.progressMinor / props.goal.targetMinor : 0))
const reached = computed(() => props.goal.progressMinor >= props.goal.targetMinor)
const late = computed(() => !reached.value && props.goal.targetDate !== null && daysFromToday(props.goal.targetDate) < 0)
const items = [
  [
    { get label() { return translate('editGoal') }, icon: "i-lucide-pencil", onSelect: () => emit("edit") },
    { get label() { return translate('deleteGoal') }, icon: "i-lucide-trash-2", color: "error" as const, onSelect: () => emit("remove") },
  ],
]
</script>

<template>
  <article class="flex flex-col border-t border-default pt-4" :aria-labelledby="`goal-${goal.id}`">
    <header class="flex items-start gap-3">
      <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
        <UIcon :name="goal.icon || 'i-lucide-target'" class="size-4" />
      </span>
      <div class="min-w-0 flex-1">
        <h3 :id="`goal-${goal.id}`" class="truncate text-sm font-medium text-highlighted" :title="goal.name">
          <button type="button" class="cursor-pointer rounded-sm text-left hover:underline focus-visible:outline-2 focus-visible:outline-primary" @click="emit('edit')">
            {{ goal.name }}
          </button>
        </h3>
        <p class="mt-0.5 text-xs text-muted">
          <template v-if="goal.targetDate">{{ $t('by', { value1: formatDate(goal.targetDate) }) }}</template>
          <template v-else>{{ $t('noDate') }}</template>
        </p>
      </div>
      <UBadge
        v-if="shared"
        color="neutral"
        variant="outline"
        size="sm"
        :icon="goal.ownerId ? 'i-lucide-lock' : 'i-lucide-users'"
        :label="goal.ownerId ? $t('personal') : $t('shared')"
      />
      <UDropdownMenu :items="items" :content="{ align: 'end' }">
        <UButton
          icon="i-lucide-ellipsis"
          color="neutral"
          variant="ghost"
          size="sm"
          class="-mt-1 -mr-2 size-10 justify-center sm:size-8"
          :aria-label="$t('actionsFor', { value1: goal.name })"
        />
      </UDropdownMenu>
    </header>

    <div class="flex items-center gap-4 py-5">
      <GoalRing :value="share" :label="$t('saved', { value1: formatPercent(share) })" />
      <div class="min-w-0">
        <p class="text-xl font-semibold text-highlighted">
          <Money :minor="goal.progressMinor" :currency="currency" compact />
        </p>
        <p class="text-sm text-muted">{{ $t('of') }} <Money :minor="goal.targetMinor" :currency="currency" compact /></p>
      </div>
    </div>

    <dl class="mt-auto grid gap-1.5 border-t border-default pt-3 text-xs">
      <div class="flex items-center justify-between gap-3">
        <dt class="text-muted">{{ $t('eachMonth') }}</dt>
        <dd class="flex items-center gap-1 text-right">
          <template v-if="reached">
            <UIcon name="i-lucide-circle-check" class="size-3.5 text-success" />
            <span class="text-highlighted">{{ $t('reached') }}</span>
          </template>
          <template v-else-if="late">
            <UIcon name="i-lucide-triangle-alert" class="size-3.5 text-warning" />
            <span class="text-highlighted">{{ $t('datePassed') }}</span>
          </template>
          <span v-else-if="goal.monthlyNeededMinor !== null" class="money text-highlighted">{{ format(goal.monthlyNeededMinor, currency) }}</span>
          <span v-else class="text-muted">{{ $t('setADateToSeeIt') }}</span>
        </dd>
      </div>
      <div class="flex items-center justify-between gap-3">
        <dt class="text-muted">{{ $t('progressFrom') }}</dt>
        <dd class="min-w-0 truncate text-right text-default" :title="account?.name">
          {{ goal.accountId ? (account?.name ?? $t('aLinkedAccount')) : $t('updatedByHand') }}
        </dd>
      </div>
    </dl>
  </article>
</template>
