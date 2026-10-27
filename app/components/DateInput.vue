<script setup lang="ts">
import { parseDate, type DateValue } from "@internationalized/date"
import { currentFormatLocale } from "~/lib/i18n"

defineOptions({ inheritAttrs: false })
const props = defineProps<{ min?: string; max?: string }>()
const model = defineModel<string>({ default: "" })
const value = computed({
  get: () => model.value ? parseDate(model.value) : undefined,
  set: (date: DateValue | undefined) => { model.value = date?.toString() ?? "" },
})
const minimum = computed(() => props.min ? parseDate(props.min) : undefined)
const maximum = computed(() => props.max ? parseDate(props.max) : undefined)
const open = ref(false)
</script>

<template>
  <UInputDate v-model="value" v-bind="$attrs" :locale="currentFormatLocale()" :min-value="minimum" :max-value="maximum">
    <template #trailing>
      <UPopover v-model:open="open">
        <UButton color="neutral" variant="link" size="sm" icon="i-lucide-calendar" :aria-label="$t('openCalendar')" />
        <template #content>
          <UCalendar v-model="value" :locale="currentFormatLocale()" :min-value="minimum" :max-value="maximum" class="p-2" @update:model-value="open = false" />
        </template>
      </UPopover>
    </template>
  </UInputDate>
</template>
