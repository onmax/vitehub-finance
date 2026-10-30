<script setup lang="ts">
import type { Insight } from "#shared/api"

// Ways to save, found in the recurring payments: what to look at, and what it's worth a year. "Show" points at the
// payments in the list below; "Dismiss" hides an insight on this device until its numbers change.
const props = defineProps<{ insights: Insight[] }>()
const emit = defineEmits<{ show: [ids: string[]] }>()
const { format } = useMoney()

const dismissed = useLocalStorage<string[]>("finance:dismissed-insights", [])
const idOf = (insight: Insight) => `${insight.kind}:${insight.recurringIds.join(",")}:${insight.savingsMinor}`
const visible = computed(() => props.insights.filter((insight) => !dismissed.value.includes(idOf(insight))))
const total = computed(() => visible.value.reduce((sum, insight) => sum + insight.savingsMinor, 0))

const KIND = {
  price_increase: { icon: "i-lucide-trending-up", get label() { return translate('priceWentUp') } },
  duplicate: { icon: "i-lucide-users", get label() { return translate('paidTwice') } },
  large_subscription: { icon: "i-lucide-badge-euro", get label() { return translate('largeSubscription') } },
  unused: { icon: "i-lucide-clock", get label() { return translate('maybeUnused') } },
} as const
</script>

<template>
  <section v-if="visible.length" aria-labelledby="insights-title" class="flex flex-col">
    <div class="flex items-baseline justify-between gap-3 border-b border-default pb-2">
      <h2 id="insights-title" class="text-sm font-medium text-highlighted">{{ $t('waysToSave') }}</h2>
      <p class="text-sm text-muted"> {{ $t('upTo') }} <span class="money font-medium text-highlighted">{{ format(total, null, { compact: true }) }}</span> {{ $t('aYear') }} </p>
    </div>
    <ul class="divide-y divide-default">
      <li v-for="insight in visible" :key="idOf(insight)" class="flex flex-col gap-3 py-4 sm:flex-row sm:items-start">
        <span class="grid size-8 shrink-0 place-items-center rounded-md bg-warning/10 text-warning" aria-hidden="true">
          <UIcon :name="KIND[insight.kind].icon" class="size-4" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-xs text-muted">{{ KIND[insight.kind].label }}</p>
          <h3 class="text-sm font-medium text-highlighted">{{ insightText(insight).title }}</h3>
          <p class="mt-1 text-sm text-muted">{{ insightText(insight).detail }}</p>
        </div>
        <div class="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
          <p class="text-sm">
            <span class="text-muted">{{ $t('save') }} </span>
            <span class="money font-medium text-highlighted">{{ format(insight.savingsMinor, null, { compact: true }) }}</span>
            <span class="text-muted"> {{ $t('aYear') }}</span>
          </p>
          <div class="flex gap-1">
            <UButton color="neutral" variant="ghost" size="sm" :label="$t('dismiss')" @click="dismissed.push(idOf(insight))" />
            <UButton v-if="insight.recurringIds.length" color="neutral" variant="outline" size="sm" :label="$t('show')" @click="emit('show', insight.recurringIds)" />
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
