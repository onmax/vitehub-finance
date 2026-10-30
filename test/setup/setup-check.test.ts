import { readFileSync } from "node:fs"
import type { H3Event } from "h3"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { SetupCheck } from "#shared/api"
import { SETUP_STEP_TITLES, setupPrompt } from "#shared/setup-prompt"
import { SETUP_STEPS, nextStep, setupSteps } from "#shared/setup-steps"

// What Enable Banking answers and what the app has set, as each test says.
const state = vi.hoisted(() => ({
  config: { appId: "synthetic-app", privateKey: "synthetic-key" } as { appId: string; privateKey: string } | null,
  application: async (): Promise<unknown> => ({ environment: "production", active: true, redirectUrls: [] as string[] }),
  allowed: "",
}))
vi.mock("vite-hub/database/drizzle", async () => ({ db: (await import("../database")).db }))
vi.mock("vite-hub/kv", async () => ({ kv: (await import("../database")).kv }))
vi.mock("nitro/runtime-config", () => ({ useRuntimeConfig: () => ({ origin: "", public: { host: "cloudflare" } }) }))
vi.mock("#vitehub/env/server", () => ({
  useServerEnv: () => ({ finance: { allowedEmails: { unseal: () => state.allowed }, origin: "", contactEmail: "" } }),
}))
vi.mock("#mailer", () => ({ sendsEmail: false }))
vi.mock("../../server/utils/ai-gateway", () => ({ serverRoute: () => null }))
vi.mock("../../server/utils/connections", () => ({ bankConfig: () => state.config }))
vi.mock("../../server/providers/enable-banking", () => ({ bankApplication: () => state.application() }))

const { addConnection, household, kv, migrate } = await import("../database")
const { ProviderError } = await import("../../server/providers/types")
const { setupCheck } = await import("../../server/utils/setup-check")

const event = { url: new URL("https://finance.example.com/docs/guides/setup") } as unknown as H3Event
const CALLBACK = "https://finance.example.com/api/connect/callback"
let lucia: Awaited<ReturnType<typeof household>>[number]
let pablo: Awaited<ReturnType<typeof household>>[number]

beforeAll(async () => {
  await migrate()
  ;[lucia, pablo] = await household("setup-home", ["setup-lucia", "setup-pablo"])
})

beforeEach(async () => {
  state.config = { appId: "synthetic-app", privateKey: "synthetic-key" }
  state.application = async () => ({ environment: "production", active: true, redirectUrls: [CALLBACK] })
  state.allowed = ""
  await kv.del("app:origin")
})

describe("the setup check", () => {
  it("asks Enable Banking nothing without an app ID and key", async () => {
    state.config = null
    state.application = async () => {
      throw new Error("not called")
    }
    expect((await setupCheck(event, lucia!)).banks).toEqual({ state: "missing" })
  })

  it("checks the redirect URL against this request's origin", async () => {
    expect((await setupCheck(event, lucia!)).banks).toEqual({ state: "ready", environment: "production", active: true, redirectRegistered: true })
    state.application = async () => ({ environment: "sandbox", active: false, redirectUrls: ["http://localhost:3000/api/connect/callback"] })
    expect((await setupCheck(event, lucia!)).banks).toEqual({ state: "ready", environment: "sandbox", active: false, redirectRegistered: false })
  })

  it("tells a refused key from Enable Banking being down", async () => {
    state.application = async () => {
      throw new ProviderError("auth", "Enable Banking rejected the app ID or private key.")
    }
    expect((await setupCheck(event, lucia!)).banks).toEqual({ state: "rejected" })
    state.application = async () => {
      throw new Error("The private key must be a PKCS#8 PEM (BEGIN PRIVATE KEY).")
    }
    expect((await setupCheck(event, lucia!)).banks).toEqual({ state: "rejected" })
    state.application = async () => {
      throw new ProviderError("unavailable", "Couldn't reach Enable Banking. Try again later.")
    }
    expect((await setupCheck(event, lucia!)).banks).toEqual({ state: "unreachable" })
  })

  it("counts only the caller's own bank connections, once the consent finished", async () => {
    await addConnection({ householdId: "setup-home", ownerId: lucia!.userId, provider: "enable_banking", status: "pending" })
    expect((await setupCheck(event, lucia!)).bankConnected).toBe(false)
    await addConnection({ householdId: "setup-home", ownerId: lucia!.userId, provider: "enable_banking", status: "expired" })
    expect((await setupCheck(event, lucia!)).bankConnected).toBe(true)
    expect((await setupCheck(event, pablo!)).bankConnected).toBe(false)
  })

  it("reports the rest without any value of a secret", async () => {
    state.allowed = "person@example.com"
    await kv.set("app:origin", "https://finance.example.com")
    const check = await setupCheck(event, pablo!)
    expect(check).toMatchObject({
      runs: "cloudflare",
      callbackUrl: CALLBACK,
      email: false,
      ai: null,
      signUp: "allowed",
      links: { origin: "https://finance.example.com", from: "first-visit" },
      contactEmail: false,
    })
    expect(JSON.stringify(check)).not.toMatch(/synthetic|person@example/)
  })
})

const check = (overrides: Partial<SetupCheck> = {}): SetupCheck => ({
  runs: "node",
  callbackUrl: CALLBACK,
  banks: { state: "missing" },
  bankConnected: false,
  email: false,
  ai: null,
  signUp: "anyone",
  links: { origin: null, from: null },
  contactEmail: false,
  ...overrides,
})
const statuses = (value: SetupCheck) => setupSteps(value).map((step) => step.status)

describe("the setup steps", () => {
  it("can't tell the account, the app, or the links before the credentials work", () => {
    expect(statuses(check())).toEqual(["unchecked", "unchecked", "missing", "unchecked", "todo"])
    expect(nextStep(setupSteps(check()))).toMatchObject({ id: "account", number: 1 })
    expect(statuses(check({ banks: { state: "rejected" } }))).toEqual(["done", "unchecked", "rejected", "unchecked", "todo"])
  })

  it("says what's wrong with a registered app", () => {
    const app = (environment: "production" | "sandbox", redirectRegistered: boolean, active = false) => check({ banks: { state: "ready", environment, active, redirectRegistered } })
    expect(statuses(app("sandbox", true))[1]).toBe("sandbox")
    expect(statuses(app("production", false))[1]).toBe("redirect")
    expect(statuses(app("production", true))).toEqual(["done", "done", "done", "todo", "todo"])
    expect(nextStep(setupSteps(app("production", true)))?.id).toBe("link")
    expect(nextStep(setupSteps({ ...app("production", true, true), bankConnected: true }))).toBeNull()
  })

  it("are the guide's steps, in its order, each showing its status", () => {
    const guide = readFileSync(new URL("../../docs/1.guides/0.setup.md", import.meta.url), "utf8")
    const headings = [...guide.matchAll(/^### (.+)\n:::setup-status\{step="([a-z]+)"\}$/gm)].map((match) => [match[2], match[1]])
    expect(headings).toEqual(SETUP_STEPS.map((id) => [id, SETUP_STEP_TITLES[id]]))
  })
})

describe("the setup prompt", () => {
  it("links the guide's Markdown and hands over each step by number, starting at the first one left", () => {
    const prompt = setupPrompt(check({ banks: { state: "ready", environment: "production", active: false, redirectRegistered: false } }), {
      origin: "https://finance.example.com",
      locale: "pt",
      date: "2026-10-30",
    })
    expect(prompt).toContain("The setup guide is https://finance.example.com/docs/guides/setup.md")
    expect(prompt).toContain("Where its steps stand (2026-10-30):")
    expect(prompt).toContain(`2. Register an app: the app doesn't list ${CALLBACK} as a redirect URL yet`)
    expect(prompt).toContain("3. Add the credentials to ViteHub Finance: done")
    expect(prompt).toContain("Start at step 2.")
    expect(prompt).toContain("Talk to me in European Portuguese.")
    expect(prompt).not.toMatch(/server/i)
  })

  it("asks which steps are done when copied signed out", () => {
    const prompt = setupPrompt(null, { origin: "http://localhost:3000", locale: "es", date: "2026-10-30" })
    expect(prompt).toContain("http://localhost:3000/docs/guides/setup.md")
    expect(prompt).toContain("Ask me which steps are done.")
    expect(prompt).toContain("Talk to me in Spanish.")
  })
})
