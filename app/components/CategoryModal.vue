<script setup lang="ts">
import type { Category } from "#shared/api"

// Add or edit a category: name, kind, icon, and color. Opened through useOverlay; closes with the saved category.
const props = defineProps<{ category?: Category }>()
const emit = defineEmits<{ close: [category?: Category] }>()

const state = reactive({
  name: props.category?.name ?? "",
  kind: props.category?.kind ?? ("expense" as Category["kind"]),
  icon: props.category?.icon ?? "i-lucide-shopping-cart",
  color: props.category?.color ?? "emerald",
})
const pending = ref(false)
const error = ref("")
const kinds = [
  { value: "expense", label: "Spending" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
]

function validate(values: typeof state) {
  return values.name.trim() ? [] : [{ name: "name", message: "Give the category a name." }]
}

async function submit() {
  pending.value = true
  error.value = ""
  try {
    const body = { name: state.name.trim(), kind: state.kind, icon: state.icon, color: state.color }
    const saved = props.category
      ? await $fetch<Category>(`/api/categories/${props.category.id}`, { method: "PATCH", body })
      : await $fetch<Category>("/api/categories", { method: "POST", body })
    await refreshNuxtData("categories")
    emit("close", saved)
  } catch (cause) {
    error.value = errorText(cause, "Couldn’t save the category. Try again.")
  } finally {
    pending.value = false
  }
}

const iconLabel = (icon: string) => icon.replace("i-lucide-", "").replace(/-/g, " ")
</script>

<template>
  <UModal
    :title="category ? 'Edit category' : 'Add a category'"
    description="Transfers stay out of spending and income totals."
    @update:open="(open) => !open && emit('close')"
  >
    <template #body>
      <UForm id="category-form" :state="state" :validate="validate" class="flex flex-col gap-4" @submit="submit">
        <div class="flex items-end gap-3">
          <CategoryIcon :icon="state.icon" :color="state.color" size="lg" />
          <UFormField label="Name" name="name" class="flex-1">
            <UInput v-model="state.name" placeholder="Groceries" autofocus class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Kind" name="kind">
          <SegmentedControl v-model="state.kind" :options="kinds" label="Kind" />
        </UFormField>
        <UFormField label="Icon" name="icon">
          <div role="radiogroup" aria-label="Icon" class="flex flex-wrap gap-1.5">
            <button
              v-for="icon in CATEGORY_ICONS"
              :key="icon"
              type="button"
              role="radio"
              :aria-checked="state.icon === icon"
              :aria-label="iconLabel(icon)"
              class="grid size-10 cursor-pointer place-items-center rounded-md border transition-[color,background-color,border-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
              :class="state.icon === icon ? 'border-primary bg-elevated text-highlighted' : 'border-default text-muted hover:bg-elevated hover:text-highlighted'"
              @click="state.icon = icon"
            >
              <UIcon :name="icon" class="size-4" />
            </button>
          </div>
        </UFormField>
        <UFormField label="Color" name="color">
          <div role="radiogroup" aria-label="Color" class="flex flex-wrap gap-1.5">
            <button
              v-for="color in CATEGORY_COLOR_NAMES"
              :key="color"
              type="button"
              role="radio"
              :aria-checked="state.color === color"
              :aria-label="color"
              :title="color"
              class="grid size-8 cursor-pointer place-items-center rounded-full ring-offset-2 ring-offset-(--ui-bg) transition-shadow duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :class="state.color === color && 'ring-2 ring-(--ui-text-highlighted)'"
              @click="state.color = color"
            >
              <span class="size-6 rounded-full" :class="categoryColor(color).solid" />
            </button>
          </div>
        </UFormField>
        <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" label="Cancel" @click="emit('close')" />
        <UButton type="submit" form="category-form" :label="category ? 'Save' : 'Add category'" :loading="pending" />
      </div>
    </template>
  </UModal>
</template>
