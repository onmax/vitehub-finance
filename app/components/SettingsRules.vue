<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui"
import type { Rule } from "#shared/api"

// The household's rules: when a description or payee has a rule's words, the rule files it under its category,
// excludes it (Revolut's round-ups, say: out of the transactions list and every total), or both. Each one says how many
// transactions it matches, which open on Transactions.
const notify = useNotify()
const { find } = useCategories()
const { data: rules, status, error, refresh } = useFetch<Rule[]>("/api/rules", {
  key: "rules",
  default: () => [],
  lazy: true,
  transform: expectJson,
})
// The ones that act on something first, the most first; then the rest by their words.
const sorted = computed(() => [...rules.value].sort((a, b) => b.matches - a.matches || a.match.localeCompare(b.match)))

// What changes when a rule does: the lists and totals it acts on, and the suggestions it may answer.
const refreshAfterRule = () => refreshStems("rules", "rule-suggestions", "transactions", "overview", "budgets", "flow", "alerts")

const state = reactive({ match: "", categoryId: undefined as string | null | undefined, exclude: false })
const pending = ref(false)
const addError = ref("")

function validate(values: typeof state) {
  const errors: Array<{ name: string; message: string }> = []
  if (!values.match.trim()) errors.push({ name: "match", message: translate('enterAWordFromTheDescription') })
  if (!values.categoryId && !values.exclude) errors.push({ name: "categoryId", message: translate('ruleNeedsAnAction') })
  return errors
}

async function add() {
  pending.value = true
  addError.value = ""
  try {
    await $fetch("/api/rules", { method: "POST", body: { match: state.match.trim(), categoryId: state.categoryId ?? null, exclude: state.exclude } })
    Object.assign(state, { match: "", categoryId: undefined, exclude: false })
    await refreshAfterRule()
  } catch (cause) {
    addError.value = errorText(cause, translate('couldnTAddTheRuleTryAgain'))
  } finally {
    pending.value = false
  }
}

const busy = ref<string | null>(null)
// A rule keeps doing at least one thing: the menu can't stop an uncategorized rule excluding, and only an excluding
// rule offers "Don't change" as its category.
async function change(rule: Rule, action: Pick<Rule, "categoryId" | "exclude">) {
  busy.value = rule.id
  try {
    await $fetch(`/api/rules/${rule.id}`, { method: "PATCH", body: action })
    await refreshAfterRule()
  } catch (cause) {
    notify.error(cause, translate('couldnTChangeTheRule'))
  } finally {
    busy.value = null
  }
}

async function remove(rule: Rule) {
  busy.value = rule.id
  try {
    await $fetch(`/api/rules/${rule.id}`, { method: "DELETE" })
    rules.value = rules.value.filter((item) => item.id !== rule.id)
    void refreshAfterRule()
  } catch (cause) {
    notify.error(cause, translate('couldnTDeleteTheRule'))
  } finally {
    busy.value = null
  }
}

const menu = (rule: Rule): DropdownMenuItem[][] => [
  [
    rule.exclude
      ? { label: translate('stopExcluding'), icon: "i-lucide-eye", disabled: !rule.categoryId, onSelect: () => change(rule, { categoryId: rule.categoryId, exclude: false }) }
      : { label: translate('ruleExclude'), icon: "i-lucide-eye-off", onSelect: () => change(rule, { categoryId: rule.categoryId, exclude: true }) },
  ],
  [{ label: translate('deleteRule'), icon: "i-lucide-trash-2", color: "error", onSelect: () => remove(rule) }],
]
// The rule's matches on Transactions, excluded ones included. The search there finds the words anywhere, so it can show a few more.
const matchesLink = (rule: Rule) => ({ path: "/transactions", query: { q: rule.match, ...(rule.exclude ? { excluded: "show" } : {}) } })
</script>

<template>
  <SettingsSection :title="$t('rules')" :description="$t('whenANewTransactionSDescriptionContainsARuleS')" flush>
    <UForm :state="state" :validate="validate" class="flex flex-col gap-3 border-b border-default py-4" @submit="add">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start">
        <UFormField name="match" class="flex-1" :label="$t('descriptionContains')">
          <UInput v-model="state.match" :placeholder="$t('mercadona')" class="w-full" />
        </UFormField>
        <UFormField name="categoryId" class="sm:w-56" :label="$t('ruleFileUnder')">
          <CategorySelect v-model="state.categoryId" allow-none :none-label="$t('ruleKeepCategory')" :placeholder="$t('pickACategory2')" class="w-full" />
        </UFormField>
        <DemoLock v-slot="{ locked }" class="sm:mt-6">
          <UButton type="submit" color="neutral" variant="outline" icon="i-lucide-plus" :label="$t('addRule')" :loading="pending" :disabled="locked" class="justify-center" :class="{ 'sm:mt-6': !locked }" />
        </DemoLock>
      </div>
      <UCheckbox v-model="state.exclude" :label="$t('ruleExclude')" :description="$t('ruleExcludeHelp')" />
    </UForm>
    <p v-if="addError" class="pt-3 text-sm text-error" role="alert">{{ addError }}</p>
    <div v-if="status === 'pending' && !rules.length" class="flex flex-col gap-3 py-4">
      <USkeleton v-for="index in 4" :key="index" class="h-5 w-64" />
    </div>
    <div v-else-if="error" class="py-4"><PageError :error="error" @retry="refresh()" /></div>
    <p v-else-if="!rules.length" class="py-4 text-sm text-muted">{{ $t('noRulesYetAddAWordAboveOrChangeA') }}</p>
    <ul v-else class="divide-y divide-default">
      <li v-for="rule in sorted" :key="rule.id" class="flex min-h-12 items-center gap-3 py-1.5">
        <span class="flex w-28 shrink-0 sm:w-44"><code class="min-w-0 truncate rounded-sm bg-elevated px-1.5 py-0.5 font-mono text-xs text-highlighted" :title="rule.match">{{ rule.match }}</code></span>
        <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0 text-dimmed" :aria-label="$t('filesUnder')" />
        <span class="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <CategorySelect
            :model-value="rule.categoryId"
            variant="ghost"
            size="sm"
            :allow-none="rule.exclude"
            :none-label="$t('ruleKeepCategory')"
            :disabled="busy === rule.id"
            :aria-label="$t('categoryForRule', { value1: rule.match })"
            class="min-w-0"
            @update:model-value="(categoryId) => change(rule, { categoryId: categoryId ?? null, exclude: rule.exclude })"
          />
          <UBadge v-if="rule.exclude" color="neutral" variant="outline" size="sm" icon="i-lucide-eye-off" :label="$t('excluded')" class="shrink-0" />
        </span>
        <ULink :to="matchesLink(rule)" class="hidden shrink-0 text-xs tabular-nums text-muted hover:text-highlighted sm:inline">
          {{ $t('ruleMatches', { count: formatCount(rule.matches) }, rule.matches) }}
        </ULink>
        <UDropdownMenu :items="menu(rule)" :content="{ align: 'end' }">
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-ellipsis" :loading="busy === rule.id" :aria-label="$t('ruleActions', { value1: rule.match })" />
        </UDropdownMenu>
      </li>
    </ul>
  </SettingsSection>
</template>
