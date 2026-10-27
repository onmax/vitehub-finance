<script setup lang="ts">
import type { CatalogProvider } from "~/utils/connect-catalog"
// What a provider's connection reads, what it can't do, and how it signs in: the three things to know before connecting.
defineProps<{ entry: CatalogProvider }>()
</script>

<template>
  <dl class="flex flex-col gap-4 text-sm">
    <div v-if="entry.reads.length">
      <dt class="font-mono text-[11px] font-medium tracking-wider text-muted uppercase">{{ $t('catalogWhatItReads') }}</dt>
      <dd class="mt-1.5">
        <ul class="flex flex-col gap-1.5">
          <li v-for="item in entry.reads" :key="item" class="flex gap-2 text-toned"><UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-muted" />{{ item }}</li>
        </ul>
      </dd>
    </div>
    <div v-if="entry.cannot.length">
      <dt class="font-mono text-[11px] font-medium tracking-wider text-muted uppercase">{{ $t('catalogWhatItCanT') }}</dt>
      <dd class="mt-1.5">
        <ul class="flex flex-col gap-1.5">
          <li v-for="item in entry.cannot" :key="item" class="flex gap-2 text-toned"><UIcon name="i-lucide-x" class="mt-0.5 size-4 shrink-0 text-muted" />{{ item }}</li>
        </ul>
      </dd>
    </div>
    <div>
      <dt class="font-mono text-[11px] font-medium tracking-wider text-muted uppercase">{{ $t('catalogHowItSignsIn') }}</dt>
      <dd class="mt-1.5 flex gap-2 text-toned">
        <UIcon :name="AUTH_METHODS[entry.auth].icon" class="mt-0.5 size-4 shrink-0 text-muted" />
        <span><span class="font-medium text-highlighted">{{ AUTH_METHODS[entry.auth].label }}.</span> {{ entry.authDetail }}</span>
      </dd>
    </div>
  </dl>
</template>
