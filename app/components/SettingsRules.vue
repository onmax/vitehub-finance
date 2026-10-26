<script setup lang="ts">
// Rules file new transactions on sync: when a description contains a word, it gets that category.
interface Rule {
  id: string
  match: string
  categoryId: string
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

const state = reactive({ match: "", categoryId: undefined as string | null | undefined })
const pending = ref(false)
const addError = ref("")

function validate(values: typeof state) {
  const errors: Array<{ name: string; message: string }> = []
  if (!values.match.trim()) errors.push({ name: "match", message: "Enter a word from the description." })
  if (!values.categoryId) errors.push({ name: "categoryId", message: "Pick a category." })
  return errors
}

async function add() {
  pending.value = true
  addError.value = ""
  try {
    await $fetch("/api/rules", { method: "POST", body: { match: state.match.trim(), categoryId: state.categoryId } })
    state.match = ""
    await refresh()
  } catch (cause) {
    addError.value = errorText(cause, "Couldn’t add the rule. Try again.")
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
    notify.error(cause, "Couldn’t delete the rule")
  } finally {
    removing.value = null
  }
}
</script>

<template>
  <SettingsSection title="Rules" description="When a new transaction’s description contains a rule’s words, it gets the rule’s category. Changes you make by hand always win." flush>
    <UForm :state="state" :validate="validate" class="flex flex-col gap-3 border-b border-default py-4 sm:flex-row sm:items-start " @submit="add">
      <UFormField name="match" class="flex-1" label="Description contains">
        <UInput v-model="state.match" placeholder="mercadona" class="w-full" />
      </UFormField>
      <UFormField name="categoryId" class="sm:w-56" label="Category">
        <CategorySelect v-model="state.categoryId" :allow-none="false" placeholder="Pick a category" class="w-full" />
      </UFormField>
      <UButton type="submit" color="neutral" variant="outline" icon="i-lucide-plus" label="Add rule" :loading="pending" class="justify-center sm:mt-6" />
    </UForm>
    <p v-if="addError" class="pt-3 text-sm text-error" role="alert">{{ addError }}</p>
    <div v-if="status === 'pending' && !rules.length" class="flex flex-col gap-3 py-4">
      <USkeleton v-for="index in 4" :key="index" class="h-5 w-64" />
    </div>
    <div v-else-if="error" class="py-4"><PageError :error="error" @retry="refresh()" /></div>
    <p v-else-if="!rules.length" class="py-4 text-sm text-muted">No rules yet. Add a word above, or change a transaction’s category and apply it to similar ones.</p>
    <ul v-else class="max-h-[28rem] divide-y divide-default overflow-y-auto">
      <li v-for="rule in sorted" :key="rule.id" class="flex min-h-12 items-center gap-3 py-1.5">
        <span class="flex w-28 shrink-0 sm:w-40"><code class="min-w-0 truncate rounded-sm bg-elevated px-1.5 py-0.5 font-mono text-xs text-highlighted" :title="rule.match">{{ rule.match }}</code></span>
        <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0 text-dimmed" aria-label="files under" />
        <span class="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <CategoryIcon :icon="find(rule.categoryId)?.icon" :color="find(rule.categoryId)?.color" size="sm" />
          <span class="truncate">{{ find(rule.categoryId)?.name ?? "Deleted category" }}</span>
        </span>
        <UTooltip text="Delete rule">
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-x" :aria-label="`Delete the rule for ${rule.match}`" :loading="removing === rule.id" @click="remove(rule)" />
        </UTooltip>
      </li>
    </ul>
  </SettingsSection>
</template>
