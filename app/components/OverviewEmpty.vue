<script setup lang="ts">
import { AccountCreateModal } from "#components"

// A new household: a still, dimmed chart behind one call to action (Midday's empty dashboard), with the other ways in
// underneath.
const overlay = useOverlay()
const addAccount = overlay.create(AccountCreateModal, { destroyOnClose: true })
// A gentle made-up line, only to show where the chart will be.
const sample = Array.from({ length: 60 }, (_, index) => ({
  date: addDays(today(), index - 59),
  value: 1000 + index * 12 + Math.sin(index / 5) * 60 + Math.cos(index / 2.3) * 25,
}))
const options = [
  { label: "Add a crypto wallet", description: "Bitcoin, Ethereum, Solana, or XRP, by address", icon: "i-lucide-wallet", to: "/connect#wallet" },
  { label: "Add a manual account", description: "Cash, a pension, a loan", icon: "i-lucide-plus", action: () => addAccount.open() },
  { label: "Import a CSV", description: "Any bank’s export", icon: "i-lucide-file-up", to: "/connect#import" },
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <section class="relative overflow-hidden rounded-xl border border-default bg-default shadow-xs">
      <div class="p-4 sm:p-5" aria-hidden="true">
        <p class="text-sm font-medium text-muted">Net worth</p>
        <p class="money mt-1 text-3xl font-semibold tracking-[-0.02em] text-dimmed">—</p>
        <AreaChart class="mt-4" :points="sample" :format="() => ''" label="Sample chart" :height="220" dimmed bare />
      </div>
      <div class="absolute inset-0 grid place-items-center bg-default/40 p-4">
        <div class="flex max-w-sm flex-col items-center rounded-xl border border-default bg-default p-6 text-center shadow-xs">
          <span class="grid size-10 place-items-center rounded-lg border border-default bg-elevated">
            <UIcon name="i-lucide-landmark" class="size-5 text-highlighted" />
          </span>
          <h2 class="mt-4 text-base font-semibold text-highlighted">Connect your bank</h2>
          <p class="mt-1 text-sm text-muted">
            Joxi reads balances and transactions through your bank’s own open-banking access. Read only: it can’t move money.
          </p>
          <UButton class="mt-5" to="/connect#bank" label="Connect a bank account" icon="i-lucide-plug" />
        </div>
      </div>
    </section>
    <div>
      <h2 class="text-sm font-medium text-muted">Or start another way</h2>
      <ul class="mt-3 grid gap-3 sm:grid-cols-3">
        <li v-for="option in options" :key="option.label">
          <component
            :is="option.to ? resolveComponent('NuxtLink') : 'button'"
            :to="option.to"
            type="button"
            class="flex h-full w-full cursor-pointer items-start gap-3 rounded-xl border border-default bg-default p-4 text-left shadow-xs transition-colors duration-150 hover:bg-elevated/50 focus-visible:outline-2 focus-visible:outline-primary"
            @click="option.action?.()"
          >
            <span class="grid size-8 shrink-0 place-items-center rounded-md border border-default bg-elevated">
              <UIcon :name="option.icon" class="size-4 text-highlighted" />
            </span>
            <span>
              <span class="block text-sm font-medium text-highlighted">{{ option.label }}</span>
              <span class="block text-sm text-muted">{{ option.description }}</span>
            </span>
          </component>
        </li>
      </ul>
    </div>
  </div>
</template>
