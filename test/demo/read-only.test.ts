import { describe, expect, it } from "vitest"
import { demoPersonMay } from "../../server/demo/read-only"
import { HTTPError } from "../../server/utils/http-error"
import { isDemoLocked } from "../../app/utils/errors"

describe("the demo, read-only for its people", () => {
  it("lets them read anything and write nothing under /api/", () => {
    for (const path of ["/api/overview", "/api/transactions", "/api/auth/get-session"]) expect(demoPersonMay("GET", path)).toBe(true)
    expect(demoPersonMay("HEAD", "/api/accounts")).toBe(true)
    for (const [method, path] of [
      ["POST", "/api/accounts"],
      ["PATCH", "/api/transactions/t1"],
      ["DELETE", "/api/goals/g1"],
      ["PUT", "/api/alerts/settings"],
      ["POST", "/api/accounts/a1/import"],
      ["POST", "/api/rules"],
      ["POST", "/api/auth/api-key/create"],
      ["POST", "/api/auth/oauth2/consent"],
      ["POST", "/api/demo/session/"],
      ["post", "/api/_evlog/ingest/x"],
    ] as const)
      expect(demoPersonMay(method, path), `${method} ${path}`).toBe(false)
  })

  it("keeps entering, switching, leaving, and error reports working", () => {
    expect(demoPersonMay("POST", "/api/demo/session")).toBe(true)
    expect(demoPersonMay("POST", "/api/auth/sign-out")).toBe(true)
    expect(demoPersonMay("POST", "/api/_evlog/ingest")).toBe(true)
    // The SPA and MCP aren't /api/; MCP tools that write check for themselves.
    expect(demoPersonMay("POST", "/mcp")).toBe(true)
  })

  it("gives the browser a refusal it recognizes, from an /api route or through Better Auth's client", () => {
    const refusal = new HTTPError({ status: 403, statusText: "Not available in the demo.", message: "Not available in the demo.", body: { code: "DEMO_LOCKED" } })
    const json = JSON.parse(JSON.stringify(refusal))
    // ofetch puts the JSON body in `data`; Better Auth's client reads its top-level `code`.
    expect(isDemoLocked({ status: 403, data: json })).toBe(true)
    expect(isDemoLocked({ status: 403, code: json.code, message: json.message })).toBe(true)
    expect(isDemoLocked({ status: 403, data: JSON.parse(JSON.stringify(new HTTPError({ status: 403, statusText: "No such account." }))) })).toBe(false)
    expect(isDemoLocked(new Error("Not available in the demo."))).toBe(false)
  })
})
