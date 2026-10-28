<script setup lang="ts">
import type { SetupStatus } from "#shared/setup"
defineProps<{ data: SetupStatus; checkedIn: boolean; pending: boolean }>()
defineEmits<{ toggle: [] }>()
const id = useId()
</script>

<template>
  <section :aria-labelledby="id" class="min-w-0 border-t border-default pt-4 lg:border-s lg:border-t-0 lg:ps-8 lg:pt-0">
    <header class="flex min-h-9 flex-wrap items-center justify-between gap-2">
      <h2 :id="id" class="text-sm font-medium text-highlighted">{{ $t('monthlyCheckin', { month: formatMonth(data.month) }) }}</h2>
      <UButton to="/transactions?view=needs-review" color="neutral" variant="link" size="sm" :label="$t('setupReviewCount', { count: data.needsReview })" class="text-muted" />
    </header>
    <p class="text-xs text-muted">{{ $t('monthlyCheckinHelp') }}</p>
    <ul class="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
      <li v-for="person in data.checkins" :key="person.userId" class="flex min-w-0 items-center gap-1.5">
        <UIcon :name="person.complete ? 'i-lucide-circle-check' : 'i-lucide-circle'" :class="person.complete ? 'text-success' : 'text-muted'" aria-hidden="true" class="shrink-0" />
        <span class="break-words text-toned">{{ person.name }}</span>
        <span class="text-muted">{{ $t(person.complete ? 'checkinComplete' : 'checkinPending') }}</span>
      </li>
    </ul>
    <div class="mt-3 flex flex-wrap items-center gap-2">
      <DemoLock v-slot="{ locked }">
        <UButton color="neutral" variant="outline" size="sm" :icon="checkedIn ? 'i-lucide-check' : undefined" :label="$t(checkedIn ? 'checkinUndo' : 'checkinFinish')" :loading="pending" :disabled="locked" @click="$emit('toggle')" />
      </DemoLock>
      <UButton v-if="data.assignedToMe" to="/transactions?view=assigned-to-me" color="neutral" variant="link" size="sm" :label="$t('setupAssignedCount', { count: data.assignedToMe })" />
    </div>
  </section>
</template>
