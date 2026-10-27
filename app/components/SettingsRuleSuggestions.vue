<script setup lang="ts">
import type { RuleSuggestion } from "#shared/api"

// Rules the household's transactions call for (server/utils/rule-suggestions-core.ts): the bank's own moves to exclude,
// and payees that keep coming back to file. Adding one makes it a rule; dismissing one keeps it away for the household.
const notify = useNotify()
const { data: suggestions, refresh } = useFetch<RuleSuggestion[]>("/api/rules/suggestions", {
  key: "rule-suggestions",
  default: () => [],
  lazy: true,
  transform: expectJson,
})

// The category each suggestion would file under, changeable before adding it.
const picked = reactive<Record<string, string | null | undefined>>({})
const categoryOf = (suggestion: RuleSuggestion) => (suggestion.key in picked ? picked[suggestion.key] : suggestion.categoryId)

const reasons = {
  manual: "suggestionBecauseManual",
  ai: "suggestionBecauseAi",
  automatic: "suggestionBecauseAutomatic",
  repeats: "suggestionBecauseRepeats",
} as const

const busy = ref<string | null>(null)
async function accept(suggestion: RuleSuggestion) {
  const categoryId = suggestion.kind === "file" ? categoryOf(suggestion) : null
  if (suggestion.kind === "file" && !categoryId) return
  busy.value = suggestion.key
  try {
    await $fetch("/api/rules", { method: "POST", body: { match: suggestion.match, categoryId, exclude: suggestion.kind === "exclude" } })
    suggestions.value = suggestions.value.filter((item) => item.key !== suggestion.key)
    notify.success(translate('ruleAdded'), translate('ruleAddedHelp', { count: formatCount(suggestion.count) }, suggestion.count))
    void refreshStems("rules", "rule-suggestions", "transactions", "overview", "budgets", "flow", "alerts")
  } catch (cause) {
    notify.error(cause, translate('couldnTAddTheRuleTryAgain'))
  } finally {
    busy.value = null
  }
}

async function dismiss(suggestion: RuleSuggestion) {
  suggestions.value = suggestions.value.filter((item) => item.key !== suggestion.key)
  try {
    await $fetch("/api/rules/suggestions/dismiss", { method: "POST", body: { key: suggestion.key } })
  } catch (cause) {
    notify.error(cause, translate('couldnTDismissTheSuggestion'))
    await refresh()
  }
}
</script>

<template>
  <SettingsSection v-if="suggestions.length" :title="$t('suggestedRules')" :description="$t('suggestedRulesHelp')" flush>
    <ul class="divide-y divide-default">
      <li v-for="suggestion in suggestions" :key="suggestion.key" class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <div class="flex min-w-0 items-center gap-3">
            <span class="flex w-28 shrink-0 sm:w-44"><code class="min-w-0 truncate rounded-sm bg-elevated px-1.5 py-0.5 font-mono text-xs text-highlighted" :title="suggestion.match">{{ suggestion.match }}</code></span>
            <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0 text-dimmed" />
            <UBadge v-if="suggestion.kind === 'exclude'" color="neutral" variant="outline" size="sm" icon="i-lucide-eye-off" :label="$t('excluded')" class="shrink-0" />
            <CategorySelect
              v-else
              :model-value="categoryOf(suggestion) ?? undefined"
              variant="ghost"
              size="sm"
              :allow-none="false"
              :placeholder="$t('pickACategory2')"
              :aria-label="$t('categoryForRule', { value1: suggestion.match })"
              class="min-w-0"
              @update:model-value="(id) => (picked[suggestion.key] = id)"
            />
          </div>
          <p class="truncate text-xs text-muted">
            <span class="tabular-nums">{{ $t('transactionsCount', { count: formatCount(suggestion.count) }, suggestion.count) }}</span>
            · {{ $t(reasons[suggestion.because]) }} ·
            <span class="text-dimmed">{{ suggestion.example }}</span>
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-plus"
            :label="$t('addRule')"
            :loading="busy === suggestion.key"
            :disabled="suggestion.kind === 'file' && !categoryOf(suggestion)"
            @click="accept(suggestion)"
          />
          <UTooltip :text="$t('dismiss')">
            <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-x" :aria-label="$t('dismissSuggestionFor', { value1: suggestion.match })" @click="dismiss(suggestion)" />
          </UTooltip>
        </div>
      </li>
    </ul>
  </SettingsSection>
</template>
