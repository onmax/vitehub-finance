<script setup lang="ts">
import type { AlertSettings } from "#shared/api"
import { fromMinor, parseAmount, toMinor } from "#shared/money"

// What shows in Alerts, one row per kind: a switch, what it watches, and its threshold beside it (Quiver's alarm
// configuration, flattened into one form). Amounts are in the household's currency, the one budgets are kept in.
const open = defineModel<boolean>("open", { default: false })
const notify = useNotify()
const { locale } = useMoney()
const { data: settings, status, error, refresh } = useFetch<AlertSettings | null>("/api/alerts/settings", { key: "alert-settings", default: () => null })

const amount = (minor: number, currency: string) => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2, useGrouping: false }).format(fromMinor(minor, currency))
const state = reactive({ budget: true, percent: "90", lowBalance: true, lowBalanceAmount: "0", large: true, largeAmount: "500", priceIncrease: true })
watch(settings, (value) => {
  if (!value) return
  Object.assign(state, {
    budget: value.budget.enabled,
    percent: String(value.budget.percent),
    lowBalance: value.lowBalance.enabled,
    lowBalanceAmount: amount(value.lowBalance.thresholdMinor, value.currency),
    large: value.largeTransaction.enabled,
    largeAmount: amount(value.largeTransaction.thresholdMinor, value.currency),
    priceIncrease: value.priceIncrease.enabled,
  })
}, { immediate: true })
watch(open, (value) => { if (value) void refresh() })

function validate(values: typeof state) {
  const errors: Array<{ name: string; message: string }> = []
  const percent = Number(values.percent)
  if (values.budget && !(Number.isInteger(percent) && percent >= 1 && percent <= 100)) errors.push({ name: "percent", message: translate('alertPercentRange') })
  if (values.lowBalance && parseAmount(values.lowBalanceAmount) === null) errors.push({ name: "lowBalanceAmount", message: translate('enterAnAmount') })
  const large = parseAmount(values.largeAmount)
  if (values.large && (large === null || large <= 0)) errors.push({ name: "largeAmount", message: translate('enterAnAmountAboveZero') })
  return errors
}

const pending = ref(false)
async function submit() {
  if (!settings.value) return
  const currency = settings.value.currency
  pending.value = true
  try {
    settings.value = await $fetch<AlertSettings>("/api/alerts/settings", {
      method: "PUT",
      body: {
        budget: { enabled: state.budget, percent: Number(state.percent) || settings.value.budget.percent },
        lowBalance: { enabled: state.lowBalance, thresholdMinor: toMinor(parseAmount(state.lowBalanceAmount) ?? 0, currency) },
        largeTransaction: { enabled: state.large, thresholdMinor: toMinor(parseAmount(state.largeAmount) ?? 0, currency) || settings.value.largeTransaction.thresholdMinor },
        priceIncrease: { enabled: state.priceIncrease },
      },
    })
    await refreshStems("alerts")
    notify.success(translate('alertSettingsSaved'))
    open.value = false
  } catch (cause) {
    notify.error(cause)
  } finally {
    pending.value = false
  }
}
const formId = `alert-settings-${useId()}`
</script>

<template>
  <USlideover v-model:open="open" :title="$t('alertSettings')" :description="$t('alertSettingsDescription')" :ui="{ content: 'max-w-md', body: 'flex flex-col', footer: 'justify-end gap-2' }">
    <template #body>
      <PageError v-if="error && !settings" :error="error" @retry="refresh()" />
      <div v-else-if="!settings" class="flex flex-col gap-6" :aria-busy="status === 'pending'">
        <USkeleton v-for="index in 5" :key="index" class="h-12 w-full" />
      </div>
      <UForm v-else :id="formId" :state="state" :validate="validate" class="flex flex-col divide-y divide-default" @submit="submit">
        <div class="flex items-start gap-3 pb-5">
          <UIcon name="i-lucide-landmark" class="mt-0.5 size-4 shrink-0 text-muted" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-highlighted">{{ $t('alertConnectionsSetting') }}</p>
            <p class="mt-0.5 text-sm text-pretty text-muted">{{ $t('alertConnectionsSettingHelp') }}</p>
          </div>
          <span class="shrink-0 font-mono text-[11px] font-medium tracking-wider text-muted uppercase">{{ $t('alwaysOn') }}</span>
        </div>

        <div class="flex flex-col gap-3 py-5">
          <USwitch v-model="state.budget" :label="$t('alertBudgetSetting')" :description="$t('alertBudgetSettingHelp')" />
          <UFormField name="percent" class="ps-11">
            <UInput v-model="state.percent" :disabled="!state.budget" inputmode="numeric" :aria-label="$t('alertBudgetSetting')" class="w-28" :ui="{ base: 'tabular-nums', trailing: 'pointer-events-none' }">
              <template #trailing><span class="text-xs text-muted">%</span></template>
            </UInput>
          </UFormField>
        </div>

        <div class="flex flex-col gap-3 py-5">
          <USwitch v-model="state.lowBalance" :label="$t('alertLowBalanceSetting')" :description="$t('alertLowBalanceSettingHelp')" />
          <UFormField name="lowBalanceAmount" class="ps-11">
            <UInput v-model="state.lowBalanceAmount" :disabled="!state.lowBalance" inputmode="decimal" :aria-label="$t('alertLowBalanceSetting')" class="w-40" :ui="{ base: 'tabular-nums', trailing: 'pointer-events-none' }">
              <template #trailing><span class="text-xs text-muted">{{ settings.currency }}</span></template>
            </UInput>
          </UFormField>
        </div>

        <div class="flex flex-col gap-3 py-5">
          <USwitch v-model="state.large" :label="$t('alertLargeSetting')" :description="$t('alertLargeSettingHelp')" />
          <UFormField name="largeAmount" class="ps-11">
            <UInput v-model="state.largeAmount" :disabled="!state.large" inputmode="decimal" :aria-label="$t('alertLargeSetting')" class="w-40" :ui="{ base: 'tabular-nums', trailing: 'pointer-events-none' }">
              <template #trailing><span class="text-xs text-muted">{{ settings.currency }}</span></template>
            </UInput>
          </UFormField>
        </div>

        <div class="pt-5">
          <USwitch v-model="state.priceIncrease" :label="$t('alertPriceSetting')" :description="$t('alertPriceSettingHelp')" />
        </div>
      </UForm>
    </template>

    <template #footer>
      <UButton color="neutral" variant="ghost" :label="$t('cancel')" @click="open = false" />
      <DemoLock v-slot="{ locked }">
        <UButton type="submit" :form="formId" :label="$t('save')" :loading="pending" :disabled="locked || !settings" />
      </DemoLock>
    </template>
  </USlideover>
</template>
