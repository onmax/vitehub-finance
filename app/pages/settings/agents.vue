<script setup lang="ts">
// How to connect an AI agent to ViteHub Finance's MCP server: the URL, ready-to-paste setups, and personal API keys.
useHead({ get title() { return translate('agents') } })
const origin = useRequestURL().origin
const server = `${origin}/mcp`
const tab = ref("claude")
const tabs = [
  { get label() { return "Claude Code" }, value: "claude" },
  { get label() { return translate('jsonConfig') }, value: "json" },
  { get label() { return translate('apiKey') }, value: "key" },
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
  <SettingsSection :title="$t('connectAnAgent')" :description="$t('claudeChatgptCursorAndOtherMcpClientsCanReadYour')">
    <div class="flex flex-col gap-5">
      <UFormField :label="$t('mcpServerUrl')">
        <CodeSnippet :code="server" :label="$t('serverUrl')" />
      </UFormField>

      <div class="flex flex-col gap-3">
        <SegmentedControl v-model="tab" :options="tabs" :label="$t('setupInstructions')" size="sm" class="self-start" />
        <template v-if="tab === 'claude'">
          <p class="text-sm text-muted">{{ $t('runThisInATerminalTheFirstTimeClaudeCode') }}</p>
          <CodeSnippet :code="claude" :label="$t('claudeCodeCommand')" />
        </template>
        <template v-else-if="tab === 'json'">
          <p class="text-sm text-muted">{{ $t('forClientsConfiguredWithJsonClaudeDesktopCursorVsCode') }}</p>
          <CodeSnippet :code="json" :label="$t('jsonConfig')" multiline />
        </template>
        <template v-else>
          <p class="text-sm text-muted">{{ $t('forClientsThatCanTSignInWithOauthCreate') }}</p>
          <CodeSnippet :code="withKey" :label="$t('jsonConfigWithAnApiKey')" multiline />
        </template>
      </div>

      <p class="flex gap-2 text-sm text-muted">
        <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0" />
        <span>{{ $t('anAgentSeesExactlyWhatYouSeeIncludingYourPrivate') }}</span>
      </p>
    </div>
  </SettingsSection>

  <SettingsConnectedAgents />

  <SettingsApiKeys />
</template>
