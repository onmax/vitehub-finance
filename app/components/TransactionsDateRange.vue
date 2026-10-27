<script setup lang="ts">
// A date range for the transactions filter: quick presets and two date fields, in a popover. Empty means any date.
const from = defineModel<string>("from", { default: "" })
const to = defineModel<string>("to", { default: "" })
const open = ref(false)
const draft = reactive({ from: from.value, to: to.value })
watch(open, (value) => value && Object.assign(draft, { from: from.value, to: to.value }))

const month = currentMonth()
const lastMonth = addMonths(month, -1)
const monthEnd = (value: string) => addDays(`${addMonths(value, 1)}-01`, -1)
const presets = [
  { get label() { return translate('thisMonth') }, from: `${month}-01`, to: "" },
  { get label() { return translate('lastMonth') }, from: `${lastMonth}-01`, to: monthEnd(lastMonth) },
  { get label() { return translate('last30Days') }, from: addDays(today(), -29), to: "" },
  { get label() { return translate('last90Days') }, from: addDays(today(), -89), to: "" },
  { get label() { return translate('thisYear') }, from: `${month.slice(0, 4)}-01-01`, to: "" },
]

function apply(range: { from: string; to: string }) {
  from.value = range.from
  to.value = range.to
  open.value = false
}

const label = computed(() => {
  const preset = presets.find((item) => item.from === from.value && item.to === to.value)
  if (preset) return preset.label
  if (from.value && to.value) return `${formatDay(from.value, { relative: false })} – ${formatDay(to.value, { relative: false })}`
  if (from.value) return translate('since2', { value1: formatDay(from.value, { relative: false }) })
  if (to.value) return translate('until', { value1: formatDay(to.value, { relative: false }) })
  return translate('anyDate')
})
const active = computed(() => Boolean(from.value || to.value))
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'start', sideOffset: 6 }">
    <UButton
      color="neutral"
      :variant="active ? 'soft' : 'outline'"
      icon="i-lucide-calendar"
      :label="label"
      trailing-icon="i-lucide-chevron-down"
      class="money shrink-0"
      :ui="{ trailingIcon: 'text-dimmed size-4' }"
    />
    <template #content>
      <div class="flex w-72 flex-col gap-3 p-3">
        <div class="grid grid-cols-2 gap-1">
          <UButton
            v-for="preset in presets"
            :key="preset.label"
            color="neutral"
            variant="ghost"
            size="sm"
            :label="preset.label"
            class="justify-start"
            @click="apply(preset)"
          />
        </div>
        <USeparator />
        <div class="grid grid-cols-2 gap-2">
          <UFormField :label="$t('from')" size="sm">
            <DateInput v-model="draft.from" size="sm" class="w-full" :max="draft.to || undefined" />
          </UFormField>
          <UFormField :label="$t('to3')" size="sm">
            <DateInput v-model="draft.to" size="sm" class="w-full" :min="draft.from || undefined" />
          </UFormField>
        </div>
        <div class="flex justify-between gap-2">
          <UButton color="neutral" variant="ghost" size="sm" :label="$t('anyDate')" :disabled="!active && !draft.from && !draft.to" @click="apply({ from: '', to: '' })" />
          <UButton size="sm" :label="$t('apply')" @click="apply(draft)" />
        </div>
      </div>
    </template>
  </UPopover>
</template>
