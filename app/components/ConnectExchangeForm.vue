<script setup lang="ts">
import type { ConnectionSummary } from "#shared/api"

// An exchange through a read-only API key. The server tries the key before saving it, so a wrong one fails here.
const emit = defineEmits<{ connected: [connection: ConnectionSummary] }>()
type Exchange = "kraken" | "binance" | "coinbase"
const GUIDES: Record<Exchange, { label: string; key: string; secret: string; help: string }> = {
  kraken: {
    label: "Kraken",
    key: "API key",
    secret: "Private key",
    help: "In Kraken, open Settings › API and create a key with only Query Funds and Query Ledger Entries. Leave trading and withdrawals off.",
  },
  binance: {
    label: "Binance",
    key: "API key",
    secret: "Secret key",
    help: "In Binance, open API Management and create a system-generated key. Keep only Enable Reading on; no trading, no withdrawals.",
  },
  coinbase: {
    label: "Coinbase",
    key: "Key name",
    secret: "Private key",
    help: "In the Coinbase Developer Platform, create a Secret API key with View permission only. Paste its name (organizations/…/apiKeys/…) and the private key.",
  },
}
const state = reactive({ provider: "kraken" as Exchange, key: "", secret: "", name: "" })
const guide = computed(() => GUIDES[state.provider])
const reveal = ref(false)
const pending = ref(false)
const error = ref("")
const options = (Object.keys(GUIDES) as Exchange[]).map((value) => ({ value, label: GUIDES[value].label }))

const validate = (values: typeof state) => [
  ...(values.key.trim() ? [] : [{ name: "key", message: `Paste the ${guide.value.key.toLowerCase()}.` }]),
  ...(values.secret.trim() ? [] : [{ name: "secret", message: `Paste the ${guide.value.secret.toLowerCase()}.` }]),
]

// The demo links nothing real (the server refuses too).
const demo = useDemo()

async function submit() {
  if (demo) return
  pending.value = true
  error.value = ""
  try {
    const connection = await $fetch<ConnectionSummary>("/api/connect/exchange", {
      method: "POST",
      body: { provider: state.provider, key: state.key.trim(), secret: state.secret.trim(), name: state.name.trim() || undefined },
    })
    Object.assign(state, { key: "", secret: "", name: "" })
    emit("connected", connection)
  } catch (cause) {
    error.value = errorText(cause, `Couldn’t connect ${guide.value.label}. Check the key and try again.`)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UForm :state="state" :validate="validate" class="flex flex-col gap-4" @submit="submit">
    <SegmentedControl v-model="state.provider" :options="options" label="Exchange" />
    <p class="text-sm text-muted">{{ guide.help }}</p>
    <UFormField :label="guide.key" name="key">
      <UInput v-model="state.key" autocomplete="off" spellcheck="false" class="w-full" :ui="{ base: 'font-mono' }" />
    </UFormField>
    <UFormField :label="guide.secret" name="secret">
      <UTextarea
        v-if="state.provider === 'coinbase' && reveal"
        v-model="state.secret"
        :rows="3"
        autocomplete="off"
        spellcheck="false"
        class="w-full"
        :ui="{ base: 'font-mono text-xs' }"
      />
      <UInput
        v-else
        v-model="state.secret"
        :type="reveal ? 'text' : 'password'"
        autocomplete="off"
        spellcheck="false"
        class="w-full"
        :ui="{ base: 'font-mono', trailing: 'pe-1' }"
      >
        <template #trailing>
          <UTooltip :text="reveal ? 'Hide' : 'Show'">
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              :icon="reveal ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              :aria-label="reveal ? 'Hide secret' : 'Show secret'"
              :aria-pressed="reveal"
              @click="reveal = !reveal"
            />
          </UTooltip>
        </template>
      </UInput>
      <UButton
        v-if="state.provider === 'coinbase' && reveal"
        color="neutral"
        variant="link"
        size="sm"
        class="mt-1 px-0"
        label="Hide private key"
        @click="reveal = false"
      />
    </UFormField>
    <UFormField label="Name" name="name" hint="Optional">
      <UInput v-model="state.name" :placeholder="`${guide.label} (Lucía)`" class="w-full" />
    </UFormField>
    <p class="flex gap-2 text-xs text-muted">
      <UIcon name="i-lucide-lock" class="mt-px size-3.5 shrink-0" />
      ViteHub Finance encrypts the key at rest and only reads balances. A key with trading or withdrawal rights isn’t needed; don’t give one.
    </p>
    <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
    <DemoLock v-slot="{ locked }" class="self-start">
      <UButton :disabled="locked" type="submit" color="neutral" variant="outline" :label="`Connect ${guide.label}`" :loading="pending" class="self-start" />
    </DemoLock>
  </UForm>
</template>
