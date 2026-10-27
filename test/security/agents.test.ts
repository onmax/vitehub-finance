import { eq } from "drizzle-orm"
import { H3 } from "h3"
import { db } from "vite-hub/database/drizzle"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { member, oauthClient, oauthConsent, organization, user } from "../../server/databases/config"
import sameOrigin from "../../server/middleware/same-origin"
import { requireMember } from "../../server/utils/identity"

// The server's request path with its real identity and middleware over an in-memory database. Better Auth is replaced
// where it checks signatures: a token here is valid when the test signed it into `tokens`, a session is a cookie.
const tokens = vi.hoisted(() => new Map<string, { sub: string; client_id: string; iat: number }>())
vi.mock("vite-hub/database/drizzle", async () => ({ db: (await import("./sqlite")).memoryDatabase() }))
vi.mock("better-auth/oauth2", () => ({
  verifyJwsAccessToken: async (token: string) => {
    const payload = tokens.get(token)
    if (!payload) throw new Error("invalid signature")
    return payload
  },
}))
vi.mock("vite-hub/auth/server", () => ({
  getAuthForRequest: () => ({
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("cookie")?.match(/session=(\w+)/)?.[1]
        return id ? { user: { id }, session: { activeOrganizationId: null } } : null
      },
      verifyApiKey: async ({ body }: { body: { key: string } }) =>
        body.key === "fin_script" ? { valid: true, key: { referenceId: "lucia", name: "Script" } } : { valid: false },
      getJwks: async () => ({ keys: [] }),
    },
  }),
}))
vi.mock("evlog/nitro/v3", () => ({ useLogger: () => ({ set: () => {}, warn: () => {}, error: () => {} }) }))

const origin = "https://finance.example"
const app = new H3()
  .use(sameOrigin)
  .all("/api/**", async (event) => ({ via: (await requireMember(event)).via }))

const second = (at: number) => Math.floor(at / 1000)
const granted = new Date("2026-10-01T10:00:00Z")

async function send(method: string, path: string, as: "browser" | "agent" | "api-key" | string) {
  const headers: Record<string, string> = { origin, "content-type": "application/json" }
  if (as === "browser") headers.cookie = "session=lucia"
  else if (as === "api-key") headers.authorization = "Bearer fin_script"
  else headers.authorization = `Bearer ${as === "agent" ? "claude" : as}`
  const response = await app.request(`${origin}${path}`, { method, headers, ...(method === "GET" || method === "DELETE" ? {} : { body: "{}" }) })
  return { status: response.status, body: await response.json().catch(() => null) }
}

beforeEach(async () => {
  tokens.clear()
  for (const table of [oauthConsent, oauthClient, member, organization, user]) await db.delete(table)
  await db.insert(user).values({ id: "lucia", name: "Lucía", email: "lucia@example.com" })
  await db.insert(organization).values({ id: "home", name: "Home", slug: "home" })
  await db.insert(member).values({ id: "m1", organizationId: "home", userId: "lucia", role: "owner" })
  await db.insert(oauthClient).values({ id: "c1", clientId: "claude", name: "Claude Code", redirectUris: "[]" })
  await db.insert(oauthConsent).values({ id: "grant1", clientId: "claude", userId: "lucia", scopes: "[]", createdAt: granted })
  tokens.set("claude", { sub: "lucia", client_id: "claude", iat: second(granted.getTime()) + 60 })
})

describe("an agent's access token", () => {
  it("acts as its person while the agent stays connected", async () => {
    expect(await send("GET", "/api/accounts", "agent")).toEqual({ status: 200, body: { via: "agent" } })
  })

  it("stops working as soon as the agent is disconnected, not when it expires", async () => {
    // What DELETE /api/agents/:id does to the approval.
    await db.delete(oauthConsent).where(eq(oauthConsent.id, "grant1"))
    expect((await send("GET", "/api/accounts", "agent")).status).toBe(401)
  })

  it("stays refused after the agent is connected again, while the new one works", async () => {
    await db.delete(oauthConsent).where(eq(oauthConsent.id, "grant1"))
    const again = new Date(granted.getTime() + 10 * 60 * 1000)
    await db.insert(oauthConsent).values({ id: "grant2", clientId: "claude", userId: "lucia", scopes: "[]", createdAt: again })
    tokens.set("fresh", { sub: "lucia", client_id: "claude", iat: second(again.getTime()) + 1 })
    expect((await send("GET", "/api/accounts", "agent")).status).toBe(401)
    expect((await send("GET", "/api/accounts", "fresh")).status).toBe(200)
  })

  it("stops working when its client is disabled or gone", async () => {
    await db.update(oauthClient).set({ disabled: true }).where(eq(oauthClient.clientId, "claude"))
    expect((await send("GET", "/api/accounts", "agent")).status).toBe(401)
    await db.delete(oauthClient)
    expect((await send("GET", "/api/accounts", "agent")).status).toBe(401)
  })

  it("never stands for another person's approval", async () => {
    await db.insert(user).values({ id: "pablo", name: "Pablo", email: "pablo@example.com" })
    await db.insert(member).values({ id: "m2", organizationId: "home", userId: "pablo", role: "member" })
    tokens.set("pablo-token", { sub: "pablo", client_id: "claude", iat: second(granted.getTime()) + 60 })
    expect((await send("GET", "/api/accounts", "pablo-token")).status).toBe(401)
  })
})

describe("agents and API keys", () => {
  const managing = [
    ["DELETE", "/api/accounts/a1"],
    ["DELETE", "/api/connections/c1"],
    ["POST", "/api/connections/c1/sync"],
    ["POST", "/api/connections/c1/reconnect"],
    ["POST", "/api/connect/wallet"],
    ["POST", "/api/connect/bank"],
    ["DELETE", "/api/agents/grant1"],
    ["PATCH", "/api/household"],
    ["POST", "/api/household/leave"],
    ["DELETE", "/api/household/members/pablo"],
    ["PUT", "/api/household/ai"],
  ] as const

  it("can't delete, connect, sync, disconnect agents, or touch the household", async () => {
    for (const as of ["agent", "api-key"])
      for (const [method, path] of managing)
        expect(await send(method, path, as), `${as} ${method} ${path}`).toMatchObject({ status: 403, body: { data: { code: "errorBrowserOnly" } } })
  })

  it("still read, categorize, and add notes", async () => {
    for (const as of ["agent", "api-key"])
      for (const [method, path] of [["GET", "/api/connections"], ["GET", "/api/accounts/a1"], ["PATCH", "/api/transactions/t1"], ["POST", "/api/rules"]] as const)
        expect((await send(method, path, as)).status, `${as} ${method} ${path}`).toBe(200)
  })

  it("leave those routes to the person in the browser", async () => {
    for (const [method, path] of managing) expect((await send(method, path, "browser")).status, `${method} ${path}`).toBe(200)
  })
})

describe("a signed-in browser", () => {
  it("can't be made to change anything from another site", async () => {
    const response = await app.request(`${origin}/api/accounts/a1`, { method: "DELETE", headers: { cookie: "session=lucia", origin: "https://evil.example" } })
    expect(response.status).toBe(403)
    const form = await app.request(`${origin}/api/rules`, { method: "POST", headers: { cookie: "session=lucia", origin, "content-type": "text/plain" }, body: "{}" })
    expect(form.status).toBe(415)
  })
})
