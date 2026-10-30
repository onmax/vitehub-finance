import type { SetupCheck } from "./api"
import type { Locale } from "./locale"
import { nextStep, setupSteps, type SetupStep, type SetupStepId } from "./setup-steps"

/** The guide in the repository, for an agent that can't reach the app's own copy. */
export const SETUP_GUIDE_SOURCE = "https://raw.githubusercontent.com/onmax/vitehub-finance/main/docs/1.guides/0.setup.md"

/** Each step's heading in the guide, word for word, so the agent finds it. */
export const SETUP_STEP_TITLES: Record<SetupStepId, string> = {
  account: "Create an Enable Banking account",
  app: "Register an app",
  credentials: "Add the credentials to ViteHub Finance",
  link: "Link your accounts",
  connect: "Connect your bank",
}

/** The person's language as the agent should read it. */
const LANGUAGES: Record<Locale, string> = { en: "English", es: "Spanish", fr: "French", de: "German", pt: "European Portuguese" }

const RUNS: Record<SetupCheck["runs"], string> = {
  dev: "`pnpm dev` on this machine",
  cloudflare: "Cloudflare Workers",
  node: "a Node host",
}

function status(step: SetupStep, check: SetupCheck) {
  const later = "can't be checked until step 3 works"
  switch (step.status) {
    case "done":
      return "done"
    case "unchecked":
      return step.id === "app" ? `${later}; its redirect URL must be ${check.callbackUrl}` : later
    case "sandbox":
      return "it's a sandbox app, which only reaches test banks; register a production app"
    case "redirect":
      return `the app doesn't list ${check.callbackUrl} as a redirect URL yet`
    case "missing":
      return "not set: ENABLE_BANKING_APP_ID and ENABLE_BANKING_PRIVATE_KEY are missing"
    case "rejected":
      return "Enable Banking rejected ENABLE_BANKING_APP_ID or ENABLE_BANKING_PRIVATE_KEY"
    case "unreachable":
      return "set, but Enable Banking didn't answer the check"
    case "todo":
      return step.id === "link" ? "no account linked in the control panel yet" : "no bank connected in the app yet"
  }
}

const links = (setup: SetupCheck["links"]) =>
  setup.origin === null
    ? "unknown (no FINANCE_DOMAIN or FINANCE_ORIGIN, and nobody has connected anything yet)"
    : `${setup.origin} (${setup.from === "domain" ? "FINANCE_DOMAIN" : setup.from === "origin" ? "FINANCE_ORIGIN" : "the first address someone connected from"})`

function standing(check: SetupCheck, date: string) {
  const steps = setupSteps(check)
  const next = nextStep(steps)
  return {
    start: next ? `Start at step ${next.number}.` : "Every step is done; check the bank shows up under Accounts, then offer the optional settings.",
    text: `Where its steps stand (${date}):
${steps.map((step) => `${step.number}. ${SETUP_STEP_TITLES[step.id]}: ${status(step, check)}`).join("\n")}

About my app: it runs on ${RUNS[check.runs]}. Email ${check.email ? "sends" : "doesn't send (the build has no email provider)"}. AI categories ${check.ai ? `use the app's key through ${check.ai}` : "have no app key"}. Sign-up is open to ${check.signUp === "allowed" ? "FINANCE_ALLOWED_EMAILS and invited people" : "anyone (FINANCE_ALLOWED_EMAILS is empty)"}. Links in emails point at ${links(check.links)}. The privacy page ${check.contactEmail ? "has" : "has no"} contact address.`,
  }
}

/**
 * The prompt the setup guide copies for a coding agent: the guide's Markdown, where its steps stand when the person is
 * signed in (`check`), and how to guide them. English; the agent then speaks the person's language.
 */
export function setupPrompt(check: SetupCheck | null, options: { origin: string; locale: Locale; date: string }) {
  const known = check
    ? standing(check, options.date)
    : {
        start: "Ask me which steps are done.",
        text: "I copied this signed out, so the steps aren't checked yet. Once I sign in, the page shows each step's status under its heading.",
      }
  return `Help me set up ViteHub Finance, one step at a time.

The setup guide is ${options.origin}/docs/guides/setup.md, in Markdown. I have the same page open in my browser. If you can't reach it, read ${SETUP_GUIDE_SOURCE}.

${known.text}

How to guide me:
- ${known.start} One step per message: what to do, with the exact link or command. Wait until I say it's done, then have me press Check again on the page and tell you what that step shows now.
- Before a command that changes my app or its hosting (setting secrets, deploying, restarting it), say what it does and run it only once I agree.
- Keep secrets out of this chat: read keys from their files, as the guide shows, and never print one. Keep .env and .pem files out of git.
- Once my bank is connected, offer the guide's optional settings my app is missing.
- Talk to me in ${LANGUAGES[options.locale]}.`
}
