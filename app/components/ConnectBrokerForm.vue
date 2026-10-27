<script setup lang="ts">
import type { ConnectionSummary } from "#shared/api"

// Interactive Brokers through a Flex token and an Activity Flex Query. The server runs the query once before saving,
// so a wrong token or query fails here with IBKR's reason.
const emit = defineEmits<{ connected: [connection: ConnectionSummary] }>()
const state = reactive({ token: "", queryId: "", name: "" })
const reveal = ref(false)
const pending = ref(false)
const error = ref("")

const validate = (values: typeof state) => [
  ...(values.token.trim() ? [] : [{ name: "token", message: translate('pasteTheFlexToken') }]),
  ...(/^\d+$/.test(values.queryId.trim()) ? [] : [{ name: "queryId", message: translate('theQueryIdIsANumber') }]),
]

// The demo links nothing real (the server refuses too).
const demo = useDemoPerson()

async function submit() {
  if (demo.value) return
  pending.value = true
  error.value = ""
  try {
    const connection = await $fetch<ConnectionSummary>("/api/connect/broker", {
      method: "POST",
      body: { provider: "ibkr", token: state.token.trim(), queryId: state.queryId.trim(), name: state.name.trim() || undefined },
    })
    Object.assign(state, { token: "", queryId: "", name: "" })
    emit("connected", connection)
  } catch (cause) {
    error.value = errorText(cause, translate('couldnTConnectInteractiveBrokersCheckTheTokenAndThe'))
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UForm :state="state" :validate="validate" class="flex flex-col gap-4" @submit="submit">
    <ol class="flex list-decimal flex-col gap-1.5 ps-4 text-sm text-muted">
      <li> {{ $t('inIbkrSClientPortalOpenPerformanceReportsFlexQueries') }} </li>
      <li>{{ $t('tickOpenPositionsAndCashReportSetFormatToXml') }}</li>
      <li> {{ $t('underFlexWebServiceConfigurationTurnTheServiceOnAnd') }} </li>
    </ol>
    <UFormField :label="$t('flexToken')" name="token">
      <UInput
        v-model="state.token"
        :type="reveal ? 'text' : 'password'"
        autocomplete="off"
        spellcheck="false"
        class="w-full"
        :ui="{ base: 'font-mono', trailing: 'pe-1' }"
      >
        <template #trailing>
          <UTooltip :text="reveal ? $t('hide') : $t('show')">
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              :icon="reveal ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              :aria-label="reveal ? $t('hideToken') : $t('showToken')"
              :aria-pressed="reveal"
              @click="reveal = !reveal"
            />
          </UTooltip>
        </template>
      </UInput>
    </UFormField>
    <UFormField :label="$t('queryId')" name="queryId">
      <UInput v-model="state.queryId" inputmode="numeric" autocomplete="off" spellcheck="false" class="w-full" :ui="{ base: 'font-mono' }" />
    </UFormField>
    <UFormField :label="$t('name')" name="name" hint="Optional">
      <UInput v-model="state.name" :placeholder="$t('interactiveBrokersLucA')" class="w-full" />
    </UFormField>
    <p class="flex gap-2 text-xs text-muted">
      <UIcon name="i-lucide-lock" class="mt-px size-3.5 shrink-0" /> {{ $t('theTokenIsStoredEncryptedAFlexTokenOnlyReads') }} </p>
    <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
    <DemoLock v-slot="{ locked }" class="self-start">
      <UButton :disabled="locked" type="submit" color="neutral" variant="outline" :label="$t('connectInteractiveBrokers')" :loading="pending" class="self-start" />
    </DemoLock>
  </UForm>
</template>
