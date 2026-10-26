<script setup lang="ts">
// A connected agent's brand mark, from the name its client registered with; unknown clients get a generic bot.
const props = defineProps<{ name: string }>()

const MARKS: Array<{ icon: string; color: string; match: RegExp }> = [
  { icon: "i-simple-icons-claude", color: "#D97757", match: /claude|anthropic/i },
  { icon: "i-simple-icons-openai", color: "currentColor", match: /chatgpt|openai|codex/i },
  { icon: "i-simple-icons-cursor", color: "currentColor", match: /cursor/i },
  { icon: "i-simple-icons-githubcopilot", color: "currentColor", match: /copilot|vs ?code/i },
  { icon: "i-simple-icons-googlegemini", color: "#8E75B2", match: /gemini/i },
  { icon: "i-simple-icons-windsurf", color: "currentColor", match: /windsurf/i },
  { icon: "i-simple-icons-zedindustries", color: "currentColor", match: /\bzed\b/i },
  { icon: "i-simple-icons-raycast", color: "#FF6363", match: /raycast/i },
  { icon: "i-simple-icons-n8n", color: "#EA4B71", match: /n8n/i },
  { icon: "i-lucide-workflow", color: "currentColor", match: /executor/i },
]

const mark = computed(() => MARKS.find((entry) => entry.match.test(props.name)) ?? { icon: "i-lucide-bot", color: "currentColor" })
</script>

<template>
  <span class="grid size-8 shrink-0 place-items-center rounded-md bg-elevated text-muted" aria-hidden="true">
    <UIcon :name="mark.icon" class="size-4" :style="{ color: mark.color }" />
  </span>
</template>
