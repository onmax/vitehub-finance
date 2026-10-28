import { useStorage } from '@vueuse/core'
import * as v from 'valibot'
import { ForecastScenarioSchema } from '#shared/planning-validation'
import type { ForecastScenario } from '#shared/forecast'
import { NO_SCENARIO } from '#shared/forecast'
import type { SavedForecastPlan } from '#shared/planning'

export function useForecastPlans() {
  const { data: me } = useMe()
  const scope = useScope()
  const key = computed(() => `finance:forecast:${me.value?.user.id ?? 'guest'}:${me.value?.household.id ?? ''}:${scope.value}`)
  const fresh = () => ({ scenario: { ...NO_SCENARIO }, activeId: null })
  const Draft = v.object({ scenario: ForecastScenarioSchema, activeId: v.nullable(v.string()) })
  const draft = useStorage<{ scenario: ForecastScenario; activeId: string | null }>(key, fresh(), undefined, {
    flush: 'sync',
    writeDefaults: false,
    serializer: {
      read: value => { if (!me.value) return fresh(); try { const result = v.safeParse(Draft, JSON.parse(value)); return result.success ? result.output : fresh() } catch { return fresh() } },
      write: value => JSON.stringify(value),
    },
  })
  const scenario = computed({ get: () => me.value ? draft.value.scenario : { ...NO_SCENARIO }, set: (value: ForecastScenario) => { if (me.value) draft.value = { ...draft.value, scenario: value } } })
  const { data: plans, refresh } = useFetch<SavedForecastPlan[]>('/api/forecast/plans', { key: 'forecast-plans', default: () => [] })
  const busy = shallowRef(false)
  const failure = shallowRef('')
  const active = computed(() => me.value ? plans.value.find(plan => plan.id === draft.value.activeId) ?? null : null)
  const owned = computed(() => !!active.value && active.value.ownerId === me.value?.user.id)
  function select(id: string) {
    if (!me.value) return
    const plan = plans.value.find(plan => plan.id === id)
    if (plan) draft.value = { scenario: structuredClone(toRaw(plan.scenario)), activeId: plan.id }
    else draft.value = { scenario: { ...NO_SCENARIO }, activeId: null }
  }
  async function save(name: string, visibility: 'private' | 'household', duplicate = false) {
    if (!me.value) return
    busy.value = true
    failure.value = ''
    try {
      const id = !duplicate && owned.value ? active.value?.id : null
      const plan = await $fetch<SavedForecastPlan>(id ? `/api/forecast/plans/${id}` : '/api/forecast/plans', { method: id ? 'PATCH' : 'POST', body: { name, visibility, scenario: scenario.value } })
      await refresh()
      draft.value = { ...draft.value, activeId: plan.id }
    } catch { failure.value = translate('planningSaveFailed') }
    finally { busy.value = false }
  }
  async function remove() {
    if (!active.value || !owned.value) return
    if (!me.value) return
    busy.value = true
    failure.value = ''
    try {
      await $fetch(`/api/forecast/plans/${active.value.id}`, { method: 'DELETE' })
      draft.value = { ...draft.value, activeId: null }
      await refresh()
    } catch { failure.value = translate('planningSaveFailed') }
    finally { busy.value = false }
  }
  return { scenario, plans, active, owned, busy, failure, select, save, remove }
}
