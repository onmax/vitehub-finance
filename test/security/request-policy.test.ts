import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { DISABLED_AUTH_PATHS } from "../../server/utils/disabled-auth-paths"
import { BROWSER_ONLY, crossSiteProblem, isBrowserOnlyRoute, requireBrowser } from "../../server/utils/request-policy"

const root = fileURLToPath(new URL("../../", import.meta.url))
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]))

/** Every route under server/api that changes something, as `METHOD /api/path` with Nitro's `[param]` segments. */
const unsafeRoutes = files(join(root, "server/api")).flatMap((file) => {
  const match = relative(join(root, "server/api"), file).match(/^(.*?)(?:\.(get|post|put|patch|delete))?\.ts$/)!
  const method = (match[2] ?? "all").toUpperCase()
  const path = `/api/${match[1]}`.replace(/\/index$/, "")
  return method === "GET" ? [] : [`${method} ${path}`]
})

// Each route that changes something is decided here, so a new one fails this test until someone decides who may call it.
const BROWSER_ONLY_ROUTES = [
  "DELETE /api/accounts/[id]",
  "DELETE /api/agents/[id]",
  "POST /api/connect/bank",
  "POST /api/connect/broker",
  "POST /api/connect/exchange",
  "POST /api/connect/wallet",
  "DELETE /api/connections/[id]",
  "POST /api/connections/[id]/reconnect",
  "POST /api/connections/[id]/sync",
  "PUT /api/household/ai",
  "POST /api/household/ai/test",
  "PATCH /api/household",
  "POST /api/household/leave",
  "DELETE /api/household/members/[userId]",
]
// Data edits an agent or a script may make as its person (PATCH /api/accounts/:id checks its sharing fields itself).
const AGENT_ROUTES = [
  "PATCH /api/accounts/[id]",
  "POST /api/accounts/[id]/import",
  "POST /api/accounts",
  "POST /api/alerts/dismiss",
  "POST /api/alerts/restore",
  "PUT /api/alerts/settings",
  "DELETE /api/budgets/[id]",
  "PATCH /api/budgets/[id]",
  "POST /api/budgets",
  "DELETE /api/categories/[id]",
  "PATCH /api/categories/[id]",
  "POST /api/categories",
  "POST /api/demo/session",
  "DELETE /api/goals/[id]",
  "PATCH /api/goals/[id]",
  "POST /api/goals",
  "PATCH /api/recurring/[id]",
  "DELETE /api/rules/[id]",
  "PATCH /api/rules/[id]",
  "POST /api/rules",
  "POST /api/rules/suggestions/dismiss",
  "POST /api/transactions/categorize",
  "PATCH /api/transactions/[id]",
]
const call = (route: string) => {
  const [method, path] = route.split(" ") as [string, string]
  return [method, path.replace(/\[\w+\]/g, "x1")] as const
}

describe("browser-only routes", () => {
  it("cover every route that changes something, one way or the other", () => {
    expect([...unsafeRoutes].sort()).toEqual([...BROWSER_ONLY_ROUTES, ...AGENT_ROUTES].sort())
  })

  it("keep deleting, sharing, connecting, agents, and the household from agents and API keys", () => {
    for (const route of BROWSER_ONLY_ROUTES) expect(isBrowserOnlyRoute(...call(route)), route).toBe(true)
    // The bank's redirect back links a connection, though it's a GET.
    expect(isBrowserOnlyRoute("GET", "/api/connect/callback")).toBe(true)
  })

  it("leave reading, categorizing, notes, and other data edits to agents", () => {
    for (const route of AGENT_ROUTES) expect(isBrowserOnlyRoute(...call(route)), route).toBe(false)
    for (const path of ["/api/accounts", "/api/accounts/x1", "/api/connections", "/api/connections/x1/runs", "/api/agents", "/api/household/ai"])
      expect(isBrowserOnlyRoute("GET", path), path).toBe(false)
  })

  it("match whatever spelling reaches the route", () => {
    for (const path of ["/api/Connections/x1", "/api//connections/x1/", "/api/connections%2Fx1", "/api/household/", "/API/HOUSEHOLD/leave"])
      expect(isBrowserOnlyRoute(path.includes("leave") ? "POST" : "delete", path), path).toBe(true)
  })

  it("refuse agents and API keys, not the browser", () => {
    expect(() => requireBrowser({ via: "browser" })).not.toThrow()
    for (const via of ["agent", "api-key"] as const)
      expect(() => requireBrowser({ via })).toThrow(expect.objectContaining({ status: 403, statusText: BROWSER_ONLY }))
  })
})

describe("cookie requests that change something", () => {
  const origin = "https://finance.example"
  const request = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
    new Request(`${origin}${path}`, { method: "POST", ...init })
  const json = { "content-type": "application/json" }

  it("pass from this origin with JSON, as the app's own $fetch sends them", () => {
    expect(crossSiteProblem(request("/api/rules", { headers: { origin, ...json }, body: "{}" }), origin)).toBeNull()
    expect(crossSiteProblem(request("/api/connections/x1", { method: "DELETE", headers: { origin } }), origin)).toBeNull()
    expect(crossSiteProblem(request("/api/connections/x1/sync", { headers: { origin } }), origin)).toBeNull()
    expect(crossSiteProblem(request("/api/rules", { headers: { origin, "content-type": "application/json; charset=utf-8" }, body: "{}" }), origin)).toBeNull()
  })

  it("fall back to the Referer when the browser sends no Origin", () => {
    expect(crossSiteProblem(request("/api/rules", { headers: { referer: `${origin}/settings`, ...json }, body: "{}" }), origin)).toBeNull()
    expect(crossSiteProblem(request("/api/rules", { headers: { referer: "https://evil.example/", ...json }, body: "{}" }), origin)?.status).toBe(403)
  })

  it("are refused from another origin, a sibling subdomain, or nowhere", () => {
    for (const from of ["https://evil.example", "https://other.finance.example", "http://finance.example", "null"])
      expect(crossSiteProblem(request("/api/accounts/x1", { method: "DELETE", headers: { origin: from } }), origin)?.status, from).toBe(403)
    expect(crossSiteProblem(request("/api/household/leave"), origin)?.status).toBe(403)
  })

  it("are refused with a body that isn't JSON, even from this origin", () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"])
      expect(crossSiteProblem(request("/api/rules", { headers: { origin, "content-type": type }, body: "{}" }), origin)?.status, type).toBe(415)
  })

  it("leave reads, bearer tokens, Better Auth, and the browser error reports alone", () => {
    expect(crossSiteProblem(request("/api/accounts", { method: "GET", headers: { origin: "https://evil.example" } }), origin)).toBeNull()
    expect(crossSiteProblem(request("/api/transactions/x1", { method: "PATCH", headers: { authorization: "Bearer fin_abc", ...json }, body: "{}" }), origin)).toBeNull()
    expect(crossSiteProblem(request("/api/auth/sign-in/email", { headers: { origin: "https://evil.example", ...json }, body: "{}" }), origin)).toBeNull()
    expect(crossSiteProblem(request("/api/_evlog/ingest", { headers: { "content-type": "text/plain" }, body: "{}" }), origin)).toBeNull()
    expect(crossSiteProblem(request("/mcp", { headers: { "content-type": "text/plain" }, body: "{}" }), origin)).toBeNull()
  })

  it("check every other spelling of an excluded route", () => {
    expect(crossSiteProblem(request("/API/auth/../household/leave", { headers: { origin: "https://evil.example" } }), origin)?.status).toBe(403)
    expect(crossSiteProblem(request("/api/_evlog/ingest/", { headers: { origin: "https://evil.example" } }), origin)?.status).toBe(403)
  })
})

describe("Better Auth's organization endpoints", () => {
  const appCalls = [
    ...new Set(
      files(join(root, "app"))
        .filter((file) => /\.(vue|ts)$/.test(file))
        .flatMap((file) => [...readFileSync(file, "utf8").matchAll(/\$auth\.organization\.(\w+)/g)].map((match) => match[1]!)),
    ),
  ].map((name) => `/organization/${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`)

  it("are off when they'd change who's in a household around moveOut", () => {
    for (const path of ["/organization/remove-member", "/organization/leave", "/organization/delete", "/organization/update-member-role"])
      expect(DISABLED_AUTH_PATHS).toContain(path)
  })

  it("stay on for every one the app calls", () => {
    expect(appCalls.length).toBeGreaterThan(0)
    for (const path of appCalls) expect(DISABLED_AUTH_PATHS, path).not.toContain(path)
  })
})
