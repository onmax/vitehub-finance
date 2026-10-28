<script setup lang="ts">
import type { SavedForecastPlan } from '#shared/planning'
const props = defineProps<{
  plans: SavedForecastPlan[]
  active: SavedForecastPlan | null
  owned: boolean
  busy: boolean
  failure: string
  comparison: { endMinor: number; lowestMinor: number } | null
  currency: string
}>()
const emit = defineEmits<{ select: [id: string]; save: [name: string, visibility: 'private' | 'household', duplicate: boolean]; remove: []; compare: [id: string] }>()
const name = shallowRef('')
const shared = shallowRef(false)
watch(() => props.active, plan => { name.value = plan?.name ?? ''; shared.value = plan?.visibility === 'household' }, { immediate: true })
const options = computed(() => [{ value: '__draft', label: translate('planningUnsaved') }, ...props.plans.map(plan => ({ value: plan.id, label: plan.name }))])
const activeId = computed({ get: () => props.active?.id ?? '__draft', set: (value: string) => emit('select', value) })
const compareId = shallowRef('__draft')
watch(compareId, id => emit('compare', id))
const demo = useDemoPerson()
</script>

<template>
  <SectionCard :title="$t('planningScenarios')" body-class="gap-4">
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <UFormField :label="$t('planningActivePlan')"><USelect v-model="activeId" :items="options" class="w-full" /></UFormField>
      <UFormField :label="$t('planningPlanName')"><UInput v-model="name" maxlength="120" class="w-full" /></UFormField>
      <UFormField :label="$t('planningCompare')"><USelect v-model="compareId" :items="options" class="w-full" /></UFormField>
      <div class="flex items-center"><UCheckbox v-model="shared" :label="$t('planningShareHousehold')" /></div>
    </div>
    <p class="text-xs text-muted">{{ $t('planningSaveHelp') }}</p>
    <p v-if="demo" class="text-sm text-muted">{{ $t('planningDemoDraft') }}</p>
    <div class="flex flex-wrap gap-2">
      <UButton :label="$t('save')" :loading="busy" :disabled="demo || !name.trim()" @click="emit('save', name.trim(), shared ? 'household' : 'private', false)" />
      <UButton v-if="active" :label="$t('planningDuplicate')" color="neutral" variant="outline" :disabled="demo || !name.trim() || busy" @click="emit('save', `${name.trim()} (2)`, shared ? 'household' : 'private', true)" />
      <UButton v-if="owned" :label="$t('delete2')" color="error" variant="ghost" :disabled="demo || busy" @click="emit('remove')" />
    </div>
    <p v-if="failure" role="alert" class="text-sm text-error">{{ failure }}</p>
    <div v-if="comparison" class="flex flex-wrap gap-x-8 gap-y-2 rounded-lg bg-elevated p-3 text-sm" aria-live="polite">
      <p>{{ $t('planningComparedEnd') }} <Money :minor="comparison.endMinor" :currency="currency" /></p>
      <p>{{ $t('planningComparedLow') }} <Money :minor="comparison.lowestMinor" :currency="currency" /></p>
    </div>
  </SectionCard>
</template>
