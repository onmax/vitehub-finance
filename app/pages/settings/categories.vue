<script setup lang="ts">
import type { AiCategorizeResult, Category } from "#shared/api"
import { CategoryModal } from "#components"

// The household's categories, grouped by kind, and the rules that file transactions into them.
useHead({ title: "Categories" })
const { categories, status, error, refresh } = useCategories()
const confirm = useConfirm()
const notify = useNotify()
const overlay = useOverlay()
const modal = overlay.create(CategoryModal, { destroyOnClose: true })

const groups = computed(() =>
  (
    [
      { kind: "expense", label: "Spending" },
      { kind: "income", label: "Income" },
      { kind: "transfer", label: "Transfers" },
    ] as const
  ).map((group) => ({
    ...group,
    items: categories.value.filter((category) => category.kind === group.kind).sort((a, b) => a.name.localeCompare(b.name)),
  })),
)

async function edit(category?: Category) {
  const saved = (await modal.open({ category }).result) as Category | undefined
  if (saved) notify.success(category ? "Category saved" : "Category added")
}

// AI categories for what the rules missed, in rounds of a few hundred (the server caps each call), until none are left.
const { data: me } = useMe()
const aiReady = computed(() => Boolean(me.value?.ai && me.value.household.aiCategorize))
const categorizing = ref(false)
const MAX_ROUNDS = 10

async function categorizeWithAi() {
  categorizing.value = true
  let asked = 0
  let categorized = 0
  let remaining = 0
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const result = await $fetch<AiCategorizeResult>("/api/transactions/categorize", { method: "POST" })
      asked += result.asked
      categorized += result.categorized
      remaining = result.remaining
      if (!result.remaining || !result.asked) break
    }
    if (!asked) notify.success("Nothing to categorize", "Every transaction you can edit has a category, or AI already looked at it.")
    else
      notify.success(
        `Categorized ${categorized} of ${asked}`,
        [
          categorized < asked ? "AI wasn’t sure about the rest; they stay uncategorized." : "",
          remaining ? `${remaining} left: run it again to continue.` : "",
        ]
          .filter(Boolean)
          .join(" ") || undefined,
      )
    if (categorized) void refreshStems("transactions", "overview", "budgets", "flow")
  } catch (cause) {
    notify.error(cause, "Couldn’t categorize with AI")
  } finally {
    categorizing.value = false
  }
}

async function remove(category: Category) {
  const { confirmed } = await confirm({
    title: `Delete “${category.name}”?`,
    description: "Its transactions become uncategorized, and its rules and budgets go with it.",
    confirmLabel: "Delete category",
    destructive: true,
  })
  if (!confirmed) return
  try {
    await $fetch(`/api/categories/${category.id}`, { method: "DELETE" })
    await Promise.all([refreshNuxtData("categories"), refreshNuxtData("rules")])
  } catch (cause) {
    notify.error(cause, "Couldn’t delete the category")
  }
}
</script>

<template>
  <SettingsSection title="Categories" description="Every transaction gets one. Budgets and spending charts group by them." flush>
    <template #actions>
      <UButton
        v-if="aiReady"
        color="neutral"
        variant="outline"
        icon="i-lucide-sparkles"
        label="Categorize uncategorized with AI"
        :loading="categorizing"
        @click="categorizeWithAi"
      />
      <UButton color="neutral" variant="outline" icon="i-lucide-plus" label="Add category" @click="edit()" />
    </template>
    <div v-if="status === 'pending' && !categories.length" class="flex flex-col gap-3 p-4 sm:px-5">
      <div v-for="index in 6" :key="index" class="flex items-center gap-3">
        <USkeleton class="size-8 rounded-md" />
        <USkeleton class="h-4 w-32" />
      </div>
    </div>
    <div v-else-if="error" class="p-4 sm:px-5"><PageError :error="error" @retry="refresh()" /></div>
    <div v-else>
      <div v-for="group in groups" :key="group.kind" class="border-b border-default last:border-b-0">
        <h3 class="border-b border-default bg-muted/50 px-4 py-2 text-xs font-medium text-muted sm:px-5">
          {{ group.label }} <span class="tabular-nums text-dimmed">{{ group.items.length }}</span>
        </h3>
        <p v-if="!group.items.length" class="px-4 py-3 text-sm text-muted sm:px-5">None yet.</p>
        <ul class="grid sm:grid-cols-2 [&>li]:border-default [&>li:not(:last-child)]:border-b sm:[&>li:nth-last-child(2):nth-child(odd)]:border-b-0 sm:[&>li:nth-child(odd)]:border-r">
          <li v-for="category in group.items" :key="category.id" class="group flex min-h-12 items-center gap-3 px-4 py-1.5 sm:px-5">
            <CategoryIcon :icon="category.icon" :color="category.color" />
            <span class="min-w-0 flex-1 truncate text-sm text-highlighted">{{ category.name }}</span>
            <UTooltip text="Edit">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-pencil" :aria-label="`Edit ${category.name}`" @click="edit(category)" />
            </UTooltip>
            <UTooltip text="Delete">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-trash-2" :aria-label="`Delete ${category.name}`" @click="remove(category)" />
            </UTooltip>
          </li>
        </ul>
      </div>
    </div>
  </SettingsSection>

  <SettingsRules />
</template>
