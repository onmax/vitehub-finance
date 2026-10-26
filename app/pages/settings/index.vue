<script setup lang="ts">
// Profile: the name your household sees, your email, and the theme on this device.
useHead({ title: "Profile" })
const { $auth } = useNuxtApp()
const { data: me, refresh } = useMe()
const session = useAuthSession()
const notify = useNotify()
const colorMode = useColorMode()

const state = reactive({ name: "" })
watchEffect(() => {
  if (!state.name && me.value) state.name = me.value.user.name
})
const pending = ref(false)
// The demo's people keep their names for every visitor (Better Auth's /update-user is off there).
const demo = useDemo()
const error = ref("")
const dirty = computed(() => Boolean(me.value) && state.name.trim() !== me.value?.user.name)

function validate(values: typeof state) {
  return values.name.trim() ? [] : [{ name: "name", message: "Enter the name your household should see." }]
}

async function save() {
  if (demo) return
  pending.value = true
  error.value = ""
  try {
    const { error: failure } = await $auth.updateUser({ name: state.name.trim() })
    if (failure) throw new Error(failure.message || "Couldn’t save your name.")
    await Promise.all([refresh(), session.refresh()])
    notify.success("Name saved")
  } catch (cause) {
    error.value = errorText(cause)
  } finally {
    pending.value = false
  }
}

const themes = [
  { value: "light", label: "Light", iconName: "i-lucide-sun" },
  { value: "dark", label: "Dark", iconName: "i-lucide-moon" },
  { value: "system", label: "System", iconName: "i-lucide-monitor" },
]
const theme = computed({
  get: () => colorMode.preference,
  set: (value: string) => (colorMode.preference = value),
})
</script>

<template>
  <UForm :state="state" :validate="validate" @submit="save">
    <SettingsSection title="Profile" description="Your name shows next to your accounts and transactions in the household.">
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <UAvatar :alt="me?.user.name ?? 'You'" :src="me?.user.image ?? undefined" size="lg" class="rounded-lg" />
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-highlighted">{{ me?.user.name ?? "…" }}</p>
            <p class="truncate text-sm text-muted">{{ me?.household.name }}</p>
          </div>
        </div>
        <UFormField label="Name" name="name" class="max-w-sm">
          <USkeleton v-if="!me" class="h-9 w-full" />
          <UInput v-else v-model="state.name" autocomplete="name" class="w-full" :disabled="demo" />
        </UFormField>
        <UFormField label="Email" name="email" help="You sign in with it. To use another email, create a new account and have the household invite it." class="max-w-sm">
          <UInput :model-value="me?.user.email ?? ''" disabled class="w-full" />
        </UFormField>
        <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
      </div>
      <template #footer>
        <DemoLock v-slot="{ locked }">
          <UButton type="submit" label="Save" :loading="pending" :disabled="locked || !dirty" />
        </DemoLock>
      </template>
    </SettingsSection>
  </UForm>

  <SettingsSection title="Theme" description="Applies to this device only.">
    <URadioGroup
      v-model="theme"
      :items="themes"
      orientation="horizontal"
      variant="card"
      indicator="hidden"
      aria-label="Theme"
      :ui="{ fieldset: 'grid grid-cols-3 gap-2', item: 'justify-center has-data-[state=checked]:border-primary' }"
    >
      <template #label="{ item }">
        <span class="flex items-center gap-2"><UIcon :name="item.iconName" class="size-4 text-muted" />{{ item.label }}</span>
      </template>
    </URadioGroup>
  </SettingsSection>
</template>
