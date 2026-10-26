<script setup lang="ts">
import type { ProviderId } from "#shared/api"

// A connection's mark: the bank's logo when we have one, the exchange's or chain's brand icon, or initials.
const props = withDefaults(defineProps<{ provider: ProviderId | null; name?: string; logo?: string | null; size?: "md" | "lg" }>(), {
  size: "md",
})
const ICONS: Partial<Record<ProviderId, string>> = {
  enable_banking: "i-lucide-landmark",
  binance: "i-simple-icons-binance",
  coinbase: "i-simple-icons-coinbase",
  bitcoin: "i-simple-icons-bitcoin",
  ethereum: "i-simple-icons-ethereum",
  solana: "i-simple-icons-solana",
  xrpl: "i-simple-icons-xrp",
  nimiq: "i-finance-nimiq",
  manual: "i-lucide-pencil-line",
}
const failed = ref(false)
watch(
  () => props.logo,
  () => (failed.value = false),
)
const icon = computed(() => (props.provider ? ICONS[props.provider] : undefined))
</script>

<template>
  <span
    class="grid shrink-0 place-items-center overflow-hidden rounded-lg border border-default bg-default"
    :class="size === 'lg' ? 'size-10' : 'size-9'"
    aria-hidden="true"
  >
    <img v-if="logo && !failed" :src="logo" alt="" class="size-full object-contain p-1" loading="lazy" @error="failed = true" />
    <UIcon v-else-if="icon" :name="icon" class="size-4.5 text-toned" />
    <span v-else class="text-xs font-medium text-toned">{{ initials(name ?? provider ?? "?") }}</span>
  </span>
</template>
