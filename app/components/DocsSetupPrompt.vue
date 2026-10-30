<script setup lang="ts">
import { setupPrompt } from "#shared/setup-prompt"

// `::setup-prompt` in the setup guide: copies the prompt for a coding agent, which reads the guide as Markdown and
// starts where the steps stand. Beside it, how many steps are done and a way to check again.
const { data, error, status, refresh, available, steps } = useSetupCheck()
const demo = useDemoBuild()
const { locale } = useLanguage()
const done = computed(() => steps.value.filter((step) => step.status === "done").length)
const { copy, copied } = useClipboard({ copiedDuring: 1500, legacy: true })
const copyPrompt = () => copy(setupPrompt(data.value, { origin: window.location.origin, locale: locale.value, date: new Date().toISOString().slice(0, 10) }))
</script>

<template>
  <div class="not-typeset my-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <UButton :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'" :label="copied ? $t('copied') : $t('setupCopyPrompt')" class="self-start" @click="copyPrompt" />
    <p v-if="demo" class="text-sm text-muted">{{ $t("setupDemo") }}</p>
    <p v-else-if="!available" class="text-sm text-muted">
      <ULink to="/login?redirect=/docs/guides/setup" class="font-medium text-highlighted underline underline-offset-2">{{ $t("signIn") }}</ULink>
      {{ $t("setupSignIn") }}
    </p>
    <div v-else class="flex items-center gap-2">
      <p class="text-sm text-muted tabular-nums" aria-live="polite">
        <template v-if="error">{{ $t("setupLoadError") }}</template>
        <template v-else-if="steps.length">{{ $t("setupStepsDone", { done, total: steps.length }) }}</template>
      </p>
      <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" :label="$t('setupCheckAgain')" :loading="status === 'pending'" @click="refresh()" />
    </div>
  </div>
</template>
