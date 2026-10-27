<script setup lang="ts">
// The MCP clients you allowed, with when they last renewed their access, and a way to cut one off.
import type { ConnectedAgent } from "#shared/api"

const notify = useNotify()
const confirm = useConfirm()
const { data: agents, status, error, refresh } = useFetch<ConnectedAgent[]>("/api/agents", { key: "settings:agents", default: () => [], lazy: true })

async function disconnect(agent: ConnectedAgent) {
  const { confirmed } = await confirm({
    title: translate('disconnect', { value1: agent.name }),
    get description() { return translate('itLosesAccessWithinTheHourAndHasToAsk') },
    confirmLabel: translate('disconnect2'),
    destructive: true,
  })
  if (!confirmed) return
  try {
    await $fetch(`/api/agents/${encodeURIComponent(agent.id)}`, { method: "DELETE" })
    await refresh()
  } catch (cause) {
    notify.error(cause, translate('couldnTDisconnectTheAgent'))
  }
}

const activity = (agent: ConnectedAgent) => {
  const connected = agent.connectedAt ? translate('connected', { value1: formatDate(new Date(agent.connectedAt)) }) : translate('connected2')
  return agent.lastSeenAt ? translate('active', { value1: connected, value2: timeAgo(new Date(agent.lastSeenAt)) }) : connected
}
</script>

<template>
  <SettingsSection :title="$t('connectedAgents')" :description="$t('agentsYouAllowedToReadYourMoneyEachOneActs')" flush>
    <div v-if="status === 'pending' && !agents.length" class="flex flex-col gap-3 py-4">
      <USkeleton class="h-5 w-48" />
      <USkeleton class="h-5 w-36" />
    </div>
    <div v-else-if="error" class="py-4"><PageError :error="error" @retry="refresh()" /></div>
    <p v-else-if="!agents.length" class="py-4 text-sm text-pretty text-muted"> {{ $t('noAgentsYetAddTheServerAboveToAnAgent') }} </p>
    <ul v-else class="divide-y divide-default">
      <li v-for="agent in agents" :key="agent.id" class="flex min-h-14 items-center gap-3 py-2">
        <AgentMark :name="agent.name" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-highlighted">{{ agent.name }}</p>
          <p class="truncate text-xs text-muted tabular-nums">{{ activity(agent) }}</p>
        </div>
        <UButton color="neutral" variant="outline" size="sm" :label="$t('disconnect2')" :aria-label="$t('disconnect3', { value1: agent.name })" @click="disconnect(agent)" />
      </li>
    </ul>
  </SettingsSection>
</template>
