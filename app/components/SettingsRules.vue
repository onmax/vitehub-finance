<script setup lang="ts">
// Rules file new transactions on sync: when a description contains a word, it gets that category. A rule can also
// exclude what it matches (Revolut's round-ups, say): out of the transactions list and every total.
interface Rule {
  id: string
  match: string
  categoryId: string
  exclude: boolean
}

const notify = useNotify()
const { find } = useCategories()
const { data: rules, status, error, refresh } = useFetch<Rule[]>("/api/rules", {
  key: "rules",
  default: () => [],
  lazy: true,
  transform: expectJson,
})
const sorted = computed(() => [...rules.value].sort((a, b) => (find(a.categoryId)?.name ?? "").localeCompare(find(b.categoryId)?.name ?? "") || a.match.localeCompare(b.match)))

const state = reactive({ match: "", categoryId: undefined as string | null | undefined, exclude: false })
const pending = ref(false)
const addError = ref("")

function validate(values: typeof state) {
  const errors: Array<{ name: string; message: string }> = []
  if (!values.match.trim()) errors.push({ name: "match", message: translate('enterAWordFromTheDescription') })
  if (!values.categoryId) errors.push({ name: "categoryId", message: translate('pickACategory') })
  return errors
}

async function add() {
  pending.value = true
  addError.value = ""
  try {
    await $fetch("/api/rules", { method: "POST", body: { match: state.match.trim(), categoryId: state.categoryId, exclude: state.exclude } })
    state.match = ""
    state.exclude = false
    await refresh()
    void refreshStems("transactions", "overview", "budgets", "flow", "alerts")
  } catch (cause) {
    addError.value = errorText(cause, translate('couldnTAddTheRuleTryAgain'))
  } finally {
    pending.value = false
  }
}

const removing = ref<string | null>(null)
async function remove(rule: Rule) {
  removing.value = rule.id
  try {
    await $fetch(`/api/rules/${rule.id}`, { method: "DELETE" })
    rules.value = rules.value.filter((item) => item.id !== rule.id)
  } catch (cause) {
    notify.error(cause, translate('couldnTDeleteTheRule'))
  } finally {
    removing.value = null
  }
}
</script>

<template>
  <SettingsSection :title="$t('rules')" :description="$t('whenANewTransactionSDescriptionContainsARuleS')" flush>
    <UForm :state="state" :validate="validate" class="flex flex-col gap-3 border-b border-default py-4" @submit="add">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start">
        <UFormField name="match" class="flex-1" :label="$t('descriptionContains')">
          <UInput v-model="state.match" :placeholder="$t('mercadona')" class="w-full" />
        </UFormField>
        <UFormField name="categoryId" class="sm:w-56" :label="$t('category')">
          <CategorySelect v-model="state.categoryId" :allow-none="false" :placeholder="$t('pickACategory2')" class="w-full" />
        </UFormField>
        <UButton type="submit" color="neutral" variant="outline" icon="i-lucide-plus" :label="$t('addRule')" :loading="pending" class="justify-center sm:mt-6" />
      </div>
      <UCheckbox v-model="state.exclude" :label="$t('ruleExclude')" :description="$t('ruleExcludeHelp')" />
    </UForm>
    <p v-if="addError" class="pt-3 text-sm text-error" role="alert">{{ addError }}</p>
    <div v-if="status === 'pending' && !rules.length" class="flex flex-col gap-3 py-4">
      <USkeleton v-for="index in 4" :key="index" class="h-5 w-64" />
    </div>
    <div v-else-if="error" class="py-4"><PageError :error="error" @retry="refresh()" /></div>
    <p v-else-if="!rules.length" class="py-4 text-sm text-muted">{{ $t('noRulesYetAddAWordAboveOrChangeA') }}</p>
    <ul v-else class="max-h-[28rem] divide-y divide-default overflow-y-auto">
      <li v-for="rule in sorted" :key="rule.id" class="flex min-h-12 items-center gap-3 py-1.5">
        <span class="flex w-28 shrink-0 sm:w-40"><code class="min-w-0 truncate rounded-sm bg-elevated px-1.5 py-0.5 font-mono text-xs text-highlighted" :title="rule.match">{{ rule.match }}</code></span>
        <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0 text-dimmed" :aria-label="$t('filesUnder')" />
        <span class="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <CategoryIcon :icon="find(rule.categoryId)?.icon" :color="find(rule.categoryId)?.color" size="sm" />
          <span class="truncate">{{ find(rule.categoryId)?.name ?? $t('deletedCategory') }}</span>
          <UBadge v-if="rule.exclude" color="neutral" variant="outline" size="sm" icon="i-lucide-eye-off" :label="$t('excluded')" class="shrink-0" />
        </span>
        <UTooltip :text="$t('deleteRule')">
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-x" :aria-label="$t('deleteTheRuleFor', { value1: rule.match })" :loading="removing === rule.id" @click="remove(rule)" />
        </UTooltip>
      </li>
    </ul>
  </SettingsSection>
</template>
