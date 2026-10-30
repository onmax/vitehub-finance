<script setup lang="ts">
import type { SetupStepId, SetupStepStatus } from "#shared/setup-steps"

// `:::setup-status{step="app"}` under each step of the setup guide: whether that step is done, what's wrong when the
// check can tell, and the one thing to do about it. Signed out, only the redirect URL to register shows.
const props = defineProps<{ step: SetupStepId }>()
const { data, available, steps, status: fetching } = useSetupCheck()
const CONTROL_PANEL = "https://enablebanking.com/cp/applications"

const status = computed<SetupStepStatus | null>(() => steps.value.find((step) => step.id === props.step)?.status ?? null)
const callbackUrl = computed(() => data.value?.callbackUrl ?? `${window.location.origin}/api/connect/callback`)
const TEXT: Record<Exclude<SetupStepStatus, "done" | "unchecked" | "todo">, string> = {
  sandbox: "setupStatusSandbox",
  redirect: "setupStatusRedirect",
  missing: "setupStatusMissing",
  rejected: "setupStatusRejected",
  unreachable: "setupStatusUnreachable",
}
type Tone = "success" | "neutral" | "warning" | "error"
const line = computed<{ tone: Tone; text: string } | null>(() => {
  const value = status.value
  if (!value) return props.step === "app" ? { tone: "neutral", text: translate("setupStatusRegisterRedirect") } : null
  if (value === "done") return { tone: "success", text: translate("setupStatusDone") }
  if (value === "unchecked") return { tone: "neutral", text: translate(props.step === "app" ? "setupStatusRegisterRedirect" : "setupStatusLater") }
  if (value === "todo") return { tone: "neutral", text: translate(props.step === "link" ? "setupStatusLinkTodo" : "setupStatusConnectTodo") }
  return { tone: value === "rejected" ? "error" : value === "missing" ? "neutral" : "warning", text: translate(TEXT[value]) }
})
const ICON: Record<Tone, string> = { success: "i-lucide-circle-check", neutral: "i-lucide-circle-dashed", warning: "i-lucide-triangle-alert", error: "i-lucide-circle-x" }
const COLOR: Record<Tone, string> = { success: "text-success", neutral: "text-muted", warning: "text-warning", error: "text-error" }
const showsRedirect = computed(() => props.step === "app" && status.value !== "done" && status.value !== "sandbox")
const opensControlPanel = computed(() => props.step === "link" && status.value === "todo")
const connects = computed(() => props.step === "connect" && status.value === "todo")
</script>

<template>
  <div v-if="available && !data && fetching === 'pending'" class="not-typeset my-3"><USkeleton class="h-5 w-40" /></div>
  <div v-else-if="line" class="not-typeset my-3 flex flex-col items-start gap-2.5">
    <p class="flex items-start gap-2 text-sm" :class="line.tone === 'neutral' ? 'text-muted' : 'text-highlighted'">
      <UIcon :name="ICON[line.tone]" class="mt-0.5 size-4 shrink-0" :class="COLOR[line.tone]" />
      <span class="text-pretty">{{ line.text }}</span>
    </p>
    <CodeSnippet v-if="showsRedirect" :code="callbackUrl" :label="$t('setupRedirectLabel')" class="w-full" />
    <UButton v-if="opensControlPanel" size="sm" color="neutral" variant="outline" trailing-icon="i-lucide-arrow-up-right" :label="$t('setupControlPanel')" :to="CONTROL_PANEL" target="_blank" />
    <UButton v-if="connects" size="sm" icon="i-lucide-landmark" :label="$t('setupConnect')" to="/connect/banks" />
  </div>
</template>
