<script setup lang="ts">
// The MCP clients you allowed, with when they last renewed their access, and a way to cut one off.
import type { ConnectedAgent } from "#shared/api"

const notify = useNotify()
const confirm = useConfirm()
const { data: agents, status, error, refresh } = useFetch<ConnectedAgent[]>("/api/agents", { key: "settings:agents", default: () => [], lazy: true })

async function disconnect(agent: ConnectedAgent) {
  const { confirmed } = await confirm({
    title: `Disconnect ${agent.name}?`,
    description: "It loses access within the hour and has to ask for your permission again to reconnect.",
    confirmLabel: "Disconnect",
    destructive: true,
  })
  if (!confirmed) return
  try {
    await $fetch(`/api/agents/${encodeURIComponent(agent.id)}`, { method: "DELETE" })
    await refresh()
  } catch (cause) {
    notify.error(cause, "Couldn’t disconnect the agent")
  }
}

const activity = (agent: ConnectedAgent) => {
  const connected = agent.connectedAt ? `Connected ${formatDate(new Date(agent.connectedAt))}` : "Connected"
  return agent.lastSeenAt ? `${connected} · active ${timeAgo(new Date(agent.lastSeenAt))}` : connected
}
</script>

<template>
  <SettingsSection title="Connected agents" description="Agents you allowed to read your money. Each one acts as you." flush>
    <div v-if="status === 'pending' && !agents.length" class="flex flex-col gap-3 py-4">
      <USkeleton class="h-5 w-48" />
      <USkeleton class="h-5 w-36" />
    </div>
    <div v-else-if="error" class="py-4"><PageError :error="error" @retry="refresh()" /></div>
    <p v-else-if="!agents.length" class="py-4 text-sm text-pretty text-muted">
      No agents yet. Add the server above to an agent, and it shows up here once you allow it.
    </p>
    <ul v-else class="divide-y divide-default">
      <li v-for="agent in agents" :key="agent.id" class="flex min-h-14 items-center gap-3 py-2">
        <AgentMark :name="agent.name" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-highlighted">{{ agent.name }}</p>
          <p class="truncate text-xs text-muted tabular-nums">{{ activity(agent) }}</p>
        </div>
        <UButton color="neutral" variant="outline" size="sm" label="Disconnect" :aria-label="`Disconnect ${agent.name}`" @click="disconnect(agent)" />
      </li>
    </ul>
  </SettingsSection>
</template>
