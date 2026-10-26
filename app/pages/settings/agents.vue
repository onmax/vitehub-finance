<script setup lang="ts">
// How to connect an AI agent to ViteHub Finance's MCP server: the URL, ready-to-paste setups, and personal API keys.
useHead({ title: "Agents" })
const origin = useRequestURL().origin
const server = `${origin}/mcp`
const tab = ref("claude")
const tabs = [
  { label: "Claude Code", value: "claude" },
  { label: "JSON config", value: "json" },
  { label: "API key", value: "key" },
]
const claude = `claude mcp add --transport http vitehub-finance ${server}`
const json = JSON.stringify({ mcpServers: { "vitehub-finance": { type: "http", url: server } } }, null, 2)
const withKey = JSON.stringify(
  { mcpServers: { "vitehub-finance": { type: "http", url: server, headers: { Authorization: "Bearer fin_…" } } } },
  null,
  2,
)
</script>

<template>
  <SettingsSection title="Connect an agent" description="Claude, ChatGPT, Cursor, and other MCP clients can read your accounts, transactions, budgets, and forecast.">
    <div class="flex flex-col gap-5">
      <UFormField label="MCP server URL">
        <CodeSnippet :code="server" label="server URL" />
      </UFormField>

      <div class="flex flex-col gap-3">
        <SegmentedControl v-model="tab" :options="tabs" label="Setup instructions" size="sm" class="self-start" />
        <template v-if="tab === 'claude'">
          <p class="text-sm text-muted">Run this in a terminal. The first time, Claude Code opens your browser to ask for permission.</p>
          <CodeSnippet :code="claude" label="Claude Code command" />
        </template>
        <template v-else-if="tab === 'json'">
          <p class="text-sm text-muted">For clients configured with JSON (Claude Desktop, Cursor, VS Code). They sign in through your browser.</p>
          <CodeSnippet :code="json" label="JSON config" multiline />
        </template>
        <template v-else>
          <p class="text-sm text-muted">For clients that can’t sign in with OAuth: create an API key below and send it as a header.</p>
          <CodeSnippet :code="withKey" label="JSON config with an API key" multiline />
        </template>
      </div>

      <p class="flex gap-2 text-sm text-muted">
        <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0" />
        <span>An agent sees exactly what you see, including your private accounts, and never manages people or household settings.</span>
      </p>
    </div>
  </SettingsSection>

  <SettingsConnectedAgents />

  <SettingsApiKeys />
</template>
