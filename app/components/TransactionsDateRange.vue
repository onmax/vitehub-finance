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
  { label: "This month", from: `${month}-01`, to: "" },
  { label: "Last month", from: `${lastMonth}-01`, to: monthEnd(lastMonth) },
  { label: "Last 30 days", from: addDays(today(), -29), to: "" },
  { label: "Last 90 days", from: addDays(today(), -89), to: "" },
  { label: "This year", from: `${month.slice(0, 4)}-01-01`, to: "" },
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
  if (from.value) return `Since ${formatDay(from.value, { relative: false })}`
  if (to.value) return `Until ${formatDay(to.value, { relative: false })}`
  return "Any date"
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
          <UFormField label="From" size="sm">
            <UInput v-model="draft.from" type="date" size="sm" class="w-full" :max="draft.to || undefined" />
          </UFormField>
          <UFormField label="To" size="sm">
            <UInput v-model="draft.to" type="date" size="sm" class="w-full" :min="draft.from || undefined" />
          </UFormField>
        </div>
        <div class="flex justify-between gap-2">
          <UButton color="neutral" variant="ghost" size="sm" label="Any date" :disabled="!active && !draft.from && !draft.to" @click="apply({ from: '', to: '' })" />
          <UButton size="sm" label="Apply" @click="apply(draft)" />
        </div>
      </div>
    </template>
  </UPopover>
</template>
