<script setup lang="ts">
import type { ForecastAccount } from "#shared/api"

// Each account on its own: its payments, its usual spending, and its usual moves to and from the others. The total
// can look fine while one account runs dry before payday; those come first. Credit cards are left out: other accounts
// pay them off, so on their own they say little.
const props = defineProps<{ accounts: ForecastAccount[]; today: string; currency: string }>()
const { format } = useMoney()
const money = (minor: number) => format(minor, props.currency, { compact: true })
const short = (minor: number) => format(minor, props.currency)
const atRisk = (account: ForecastAccount) => account.lowest.balanceMinor < 0
const sorted = computed(() =>
  props.accounts.filter((account) => account.kind !== "credit").sort((a, b) => Number(atRisk(b)) - Number(atRisk(a)) || a.ownerName.localeCompare(b.ownerName) || b.balanceMinor - a.balanceMinor),
)
const risky = computed(() => sorted.value.filter(atRisk).length)
</script>

<template>
  <section aria-labelledby="accounts-title" class="flex min-w-0 flex-col gap-4">
    <div>
      <h2 id="accounts-title" class="text-base font-semibold text-highlighted">By account</h2>
      <p class="mt-0.5 text-sm text-muted">
        {{
          risky
            ? `${risky === 1 ? "One account" : `${risky} accounts`} may go below zero even though the total doesn’t. Move money in before then to avoid it.`
            : "No account is expected to go below zero."
        }}
      </p>
    </div>
    <ul class="divide-y divide-default rounded-xl ring ring-default">
      <li class="hidden grid-cols-[auto_minmax(0,1fr)_6rem_7rem_7rem_7rem] gap-x-3 px-4 py-2 text-right text-xs font-medium text-muted sm:grid" aria-hidden="true">
        <span class="col-span-3" /><span>Today</span><span>Lowest</span><span>At the end</span>
      </li>
      <li v-for="account in sorted" :key="account.id" class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_6rem_7rem_7rem_7rem]">
        <OwnerAvatar :name="account.ownerName" size="xs" />
        <span class="min-w-0">
          <span class="flex items-center gap-2">
            <span class="truncate text-sm font-medium text-highlighted">{{ account.name }}</span>
            <UBadge v-if="atRisk(account)" color="error" variant="soft" size="sm" label="Below zero" class="shrink-0" />
          </span>
          <span class="block truncate text-xs text-muted">{{ ACCOUNT_KINDS[account.kind].label }} · {{ account.ownerName.split(" ")[0] }}</span>
        </span>
        <SparkLine
          :values="account.weekly.map((point) => point.balanceMinor)"
          :width="96"
          :height="24"
          :label="`${account.name}: ${short(account.balanceMinor)} today, ${short(account.endMinor)} at the end`"
          class="hidden sm:block"
          :class="atRisk(account) ? 'text-rose-500' : 'text-indigo-500 dark:text-indigo-400'"
        />
        <dl class="col-span-2 grid grid-cols-3 gap-3 text-right text-xs sm:contents">
          <div>
            <dt class="text-muted sm:sr-only">Today</dt>
            <dd class="money text-sm text-default">{{ money(account.balanceMinor) }}</dd>
          </div>
          <div>
            <dt class="text-muted sm:sr-only">Lowest</dt>
            <dd class="money text-sm" :class="atRisk(account) ? 'text-rose-600 dark:text-rose-400' : 'text-default'">
              {{ money(account.lowest.balanceMinor) }}
            </dd>
            <dd class="text-muted">{{ forecastDay(account.lowest.date, today, { weekday: false }) }}</dd>
          </div>
          <div>
            <dt class="text-muted sm:sr-only">At the end</dt>
            <dd class="money text-sm font-medium text-highlighted">{{ money(account.endMinor) }}</dd>
          </div>
        </dl>
      </li>
    </ul>
  </section>
</template>
