<script setup lang="ts">
import type { RouteLocationRaw } from "vue-router"

defineProps<{
  label: string
  period: string
  to: RouteLocationRaw
  values: Array<number | null>
  trendLabel: string
  comparison: string | null
  delta: number | null
  context: string
}>()
</script>

<template>
  <NuxtLink :to="to" class="group flex min-w-0 flex-col rounded-xl border border-default bg-default p-4 sm:p-5 transition-colors hover:border-accented focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
    <h2 class="text-sm font-medium text-muted group-hover:text-default">{{ label }}</h2>
    <p class="mt-1 text-xs text-muted">{{ period }}</p>
    <div class="mt-3 text-xl sm:text-[1.75rem] leading-tight font-semibold tracking-tight text-highlighted tabular-nums">
      <slot />
    </div>
    <p class="mt-2 flex flex-wrap items-baseline gap-x-1.5 text-xs leading-relaxed text-muted">
      <span v-if="comparison !== null" class="inline-flex items-center gap-1 font-medium text-default tabular-nums">
        <UIcon v-if="delta !== null && delta !== 0" :name="delta > 0 ? 'i-lucide-arrow-up-right' : 'i-lucide-arrow-down-right'" class="shrink-0" aria-hidden="true" />
        {{ comparison }}
      </span>
      <span>{{ context }}</span>
    </p>
    <div class="mt-auto pt-4 sm:pt-6">
      <OverviewSparkline :values="values" :label="trendLabel" />
    </div>
  </NuxtLink>
</template>
