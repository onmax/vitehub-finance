<script setup lang="ts">
import { useStorage } from "@vueuse/core"
import type { Insight } from "#shared/api"

// Ways to save, found in the recurring payments: what to look at, and what it's worth a year. "Show" points at the
// payments in the list below; "Dismiss" hides an insight on this device until its numbers change.
const props = defineProps<{ insights: Insight[] }>()
const emit = defineEmits<{ show: [ids: string[]] }>()
const { format } = useMoney()

const dismissed = useStorage<string[]>("finance:dismissed-insights", [])
const idOf = (insight: Insight) => `${insight.kind}:${insight.recurringIds.join(",")}:${insight.savingsMinor}`
const visible = computed(() => props.insights.filter((insight) => !dismissed.value.includes(idOf(insight))))
const total = computed(() => visible.value.reduce((sum, insight) => sum + insight.savingsMinor, 0))

const KIND = {
  price_increase: { icon: "i-lucide-trending-up", label: "Price went up" },
  duplicate: { icon: "i-lucide-users", label: "Paid twice" },
  large_subscription: { icon: "i-lucide-badge-euro", label: "Large subscription" },
  unused: { icon: "i-lucide-clock", label: "Maybe unused" },
} as const
</script>

<template>
  <section v-if="visible.length" aria-labelledby="insights-title" class="flex flex-col">
    <div class="flex items-baseline justify-between gap-3 border-b border-default pb-2">
      <h2 id="insights-title" class="text-sm font-medium text-highlighted">Ways to save</h2>
      <p class="text-sm text-muted">
        Up to <span class="money font-medium text-highlighted">{{ format(total, null, { compact: true }) }}</span> a year
      </p>
    </div>
    <ul class="divide-y divide-default">
      <li v-for="insight in visible" :key="idOf(insight)" class="flex flex-col gap-3 py-4 sm:flex-row sm:items-start">
        <span class="grid size-8 shrink-0 place-items-center rounded-md bg-warning/10 text-warning" aria-hidden="true">
          <UIcon :name="KIND[insight.kind].icon" class="size-4" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-xs text-muted">{{ KIND[insight.kind].label }}</p>
          <h3 class="text-sm font-medium text-highlighted">{{ insight.title }}</h3>
          <p class="mt-1 text-sm text-muted">{{ insight.detail }}</p>
        </div>
        <div class="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
          <p class="text-sm">
            <span class="text-muted">Save </span>
            <span class="money font-medium text-highlighted">{{ format(insight.savingsMinor, null, { compact: true }) }}</span>
            <span class="text-muted"> a year</span>
          </p>
          <div class="flex gap-1">
            <UButton color="neutral" variant="ghost" size="sm" label="Dismiss" @click="dismissed.push(idOf(insight))" />
            <UButton v-if="insight.recurringIds.length" color="neutral" variant="outline" size="sm" label="Show" @click="emit('show', insight.recurringIds)" />
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
