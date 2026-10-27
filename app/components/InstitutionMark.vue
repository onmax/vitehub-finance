<script setup lang="ts">
import type { ProviderId } from "#shared/api"
import { bankMark } from "#shared/banks"

// Whose money it is, as a small tile: the brand's own mark on its color (shared/banks.ts), the bank's logo (Enable
// Banking's, `logo`, or the built-in one), the exchange's, chain's, or broker's mark, the account kind's icon, or
// initials. Logos are remote images: lazy, sent without a referrer, and replaced by the next option if they fail. `plain`
// skips remote logos (catalog platforms that can't be connected yet): their own mark, else initials.
const props = withDefaults(
  defineProps<{ provider?: ProviderId | null; name?: string | null; logo?: string | null; icon?: string; size?: "xs" | "sm" | "md" | "lg"; plain?: boolean }>(),
  { provider: null, name: null, logo: null, icon: undefined, size: "md", plain: false },
)

// Marks for what isn't a bank, on the brand's color. Simple Icons has no Kraken, Interactive Brokers, or Nimiq, and
// only Coinbase's wordmark, so those are ours (app/assets/icons).
const PROVIDERS: Partial<Record<ProviderId, { icon: string; bg: string; fg: string }>> = {
  binance: { icon: "i-simple-icons-binance", bg: "#1e2026", fg: "#f0b90b" },
  coinbase: { icon: "i-finance-coinbase", bg: "#0052ff", fg: "#ffffff" },
  kraken: { icon: "i-finance-kraken", bg: "#7132f5", fg: "#ffffff" },
  bitcoin: { icon: "i-simple-icons-bitcoin", bg: "#f7931a", fg: "#ffffff" },
  ethereum: { icon: "i-simple-icons-ethereum", bg: "#627eea", fg: "#ffffff" },
  solana: { icon: "i-simple-icons-solana", bg: "#121212", fg: "#14f195" },
  xrpl: { icon: "i-simple-icons-xrp", bg: "#23292f", fg: "#ffffff" },
  nimiq: { icon: "i-finance-nimiq", bg: "#1f2348", fg: "#e9b213" },
  ibkr: { icon: "i-finance-ibkr", bg: "#141414", fg: "#ffffff" },
  myinvestor: { icon: "i-finance-myinvestor", bg: "#ffffff", fg: "#000000" },
}

const mark = computed(() => {
  const found = props.provider === "enable_banking" || !props.provider ? bankMark(props.name) : null
  return props.plain && !found?.icon ? null : found
})
const brand = computed(() => (mark.value?.icon ? mark.value : props.provider ? PROVIDERS[props.provider] : undefined))
const failed = ref(false)
const image = computed(() => (failed.value ? null : (props.logo ?? mark.value?.logo ?? null)))
watch(
  () => [props.logo, props.name],
  () => (failed.value = false),
)
const fallback = computed(() => props.icon ?? (props.provider === "enable_banking" ? "i-lucide-landmark" : props.provider === "manual" ? "i-lucide-pencil-line" : undefined))

const SIZES = {
  xs: { tile: "size-4 rounded-[4px]", glyph: "size-2.5", pad: "p-px", text: "text-[7px]" },
  sm: { tile: "size-5 rounded-[5px]", glyph: "size-3", pad: "p-px", text: "text-[8px]" },
  md: { tile: "size-9 rounded-lg", glyph: "size-[1.125rem]", pad: "p-1", text: "text-xs" },
  lg: { tile: "size-11 rounded-[10px]", glyph: "size-[1.375rem]", pad: "p-1.5", text: "text-sm" },
}
const sizing = computed(() => SIZES[props.size])
</script>

<template>
  <span
    class="grid shrink-0 place-items-center overflow-hidden outline -outline-offset-1 outline-black/8 dark:outline-white/10"
    :class="[sizing.tile, !brand && !image ? 'bg-elevated text-toned' : !brand ? 'bg-white' : '']"
    :style="brand ? { background: brand.bg, color: brand.fg } : undefined"
    aria-hidden="true"
  >
    <UIcon v-if="brand" :name="brand.icon" :class="sizing.glyph" />
    <img
      v-else-if="image"
      :src="image"
      alt=""
      class="size-full object-contain"
      :class="sizing.pad"
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      @error="failed = true"
    />
    <UIcon v-else-if="fallback" :name="fallback" :class="sizing.glyph" />
    <span v-else class="font-medium" :class="sizing.text">{{ initials(name ?? provider ?? "?") }}</span>
  </span>
</template>
