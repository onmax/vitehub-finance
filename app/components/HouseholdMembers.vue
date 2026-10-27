<script setup lang="ts">
import type { Person } from "#shared/api"

// The household's people with their roles. The owner removes others; anyone but the last owner may leave. Either way
// the person's accounts and connections go with them into a household of their own.
const { data: me, refresh } = useMe()
const confirm = useConfirm()
const notify = useNotify()
const pending = ref<string | null>(null)
// The demo household's people stay put for every visitor (the server refuses both too).
const demo = useDemo()

const isOwner = computed(() => me.value?.role === "owner")
const owners = computed(() => me.value?.members.filter((person) => person.role === "owner").length ?? 0)
const canLeave = computed(() => (me.value?.members.length ?? 1) > 1 && !(isOwner.value && owners.value <= 1))

async function remove(person: Person) {
  if (demo) return
  const { confirmed } = await confirm({
    title: translate('remove', { value1: person.name }),
    description: translate('losesAccessToTheHouseholdSSharedAccountsTheirOwn', { value1: person.name }),
    confirmLabel: translate('remove2'),
    destructive: true,
  })
  if (!confirmed) return
  pending.value = person.userId
  try {
    await $fetch(`/api/household/members/${person.userId}`, { method: "DELETE" })
    await refresh()
    await refreshStems("accounts", "overview", "transactions", "connections")
    notify.success(translate('removed', { value1: person.name }))
  } catch (error) {
    notify.error(error, translate('couldnTRemove', { value1: person.name }))
  } finally {
    pending.value = null
  }
}

async function leave() {
  if (demo) return
  const { confirmed } = await confirm({
    title: translate('leave', { value1: me.value?.household.name ?? translate('theHousehold') }),
    get description() { return translate('youStopSeeingTheAccountsOthersShareYourOwnAccounts') },
    confirmLabel: translate('leaveHousehold'),
    destructive: true,
  })
  if (!confirmed) return
  pending.value = "leave"
  try {
    await $fetch("/api/household/leave", { method: "POST" })
    await useAuthSession().refresh()
    clearNuxtData()
    await navigateTo("/")
    notify.success(translate('youLeftTheHousehold'), translate('yourAccountsAreInAHouseholdOfYourOwnNow'))
  } catch (error) {
    notify.error(error, translate('couldnTLeaveTheHousehold'))
    pending.value = null
  }
}
</script>

<template>
  <SettingsSection :title="$t('members')" :description="$t('peopleCount', { count: formatCount(me?.members.length ?? 1) }, me?.members.length ?? 1)" flush>
    <ul v-if="me" class="divide-y divide-default">
      <li v-for="person in me.members" :key="person.userId" class="flex min-h-16 items-center gap-3 py-3">
        <UAvatar :alt="person.name" :src="person.image ?? undefined" size="md" />
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2 text-sm font-medium text-highlighted">
            <span class="truncate">{{ person.name }}</span>
            <span v-if="person.userId === me.user.id" class="shrink-0 text-xs font-normal text-muted">{{ $t('you') }}</span>
          </p>
          <p class="truncate text-sm text-muted">{{ person.email }}</p>
        </div>
        <UBadge
          color="neutral"
          :variant="person.role === 'owner' ? 'subtle' : 'outline'"
          :label="person.role === 'owner' ? $t('owner') : $t('member')"
          class="shrink-0"
        />
        <DemoLock v-if="isOwner && person.userId !== me.user.id" v-slot="{ locked }">
          <UTooltip :text="$t('remove4', { value1: person.name })" :disabled="locked">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-user-minus"
              :aria-label="$t('remove4', { value1: person.name })"
              :loading="pending === person.userId"
              :disabled="locked"
              class="size-10 justify-center"
              @click="remove(person)"
            />
          </UTooltip>
        </DemoLock>
      </li>
    </ul>
    <div v-else class="flex flex-col divide-y divide-default">
      <div v-for="row in 2" :key="row" class="flex items-center gap-3 py-3">
        <USkeleton class="size-8 rounded-full" />
        <div class="flex flex-1 flex-col gap-1.5"><USkeleton class="h-4 w-32" /><USkeleton class="h-3.5 w-44" /></div>
      </div>
    </div>
    <template v-if="me && me.members.length > 1" #footer>
      <p v-if="!canLeave" class="mr-auto text-sm text-muted">{{ $t('youReTheOnlyOwnerSoYouCanTLeave') }}</p>
      <DemoLock v-else v-slot="{ locked }">
        <UButton
          color="error"
          variant="outline"
          icon="i-lucide-log-out"
          :label="$t('leaveHousehold')"
          :loading="pending === 'leave'"
          :disabled="locked"
          @click="leave"
        />
      </DemoLock>
    </template>
  </SettingsSection>
</template>
