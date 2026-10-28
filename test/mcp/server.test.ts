import { H3 } from "h3"
import { db } from "vite-hub/database/drizzle"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { member, organization, user } from "../../server/databases/config"
import oauthMetadata from "../../server/handlers/oauth-metadata"
import { tools } from "../../server/mcp"
import mcpRoute from "../../server/routes/mcp"

// /mcp as clients reach it: the real route, auth, and tools over an in-memory database, with a personal API key that
// Better Auth is replaced to accept.
vi.mock("vite-hub/database/drizzle", async () => ({ db: (await import("../security/sqlite")).memoryDatabase() }))
vi.mock("vite-hub/auth/server", () => ({
  getAuthForRequest: () => ({
    api: {
      getSession: async () => null,
      verifyApiKey: async ({ body }: { body: { key: string } }) =>
        body.key === "fin_script" ? { valid: true, key: { referenceId: "lucia", name: "Script" } } : { valid: false },
    },
  }),
}))
vi.mock("vite-hub/kv", () => ({ kv: { get: async () => [null, undefined], set: async () => {}, del: async () => {} } }))
vi.mock("#vitehub/env/server", () => ({ useServerEnv: () => ({}) }))
vi.mock("evlog/nitro/v3", () => ({ useLogger: () => ({ set: () => {}, warn: () => {}, error: () => {} }) }))

const origin = "https://finance.example"
const app = new H3().all("/mcp", mcpRoute).all("/.well-known/**", oauthMetadata)

async function rpc(method: string, params: object, token: string | null = "fin_script") {
  const response = await app.request(`${origin}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  return { response, body: response.status === 200 ? await response.json() : null }
}

beforeAll(async () => {
  await db.insert(user).values({ id: "lucia", name: "Lucía", email: "lucia@example.com" })
  await db.insert(organization).values({ id: "home", name: "Home", slug: "home" })
  await db.insert(member).values({ id: "m1", organizationId: "home", userId: "lucia", role: "owner" })
})

describe("tools/list", () => {
  it("lists the four tools, each with an object input schema", async () => {
    const { response, body } = await rpc("tools/list", {})
    expect(response.status).toBe(200)
    const listed = body.result.tools as Array<{ name: string; inputSchema: { type: string; properties: object } }>
    expect(listed.map((tool) => tool.name)).toEqual(["get_finances", "search_transactions", "update_transaction", "add_transactions"])
    for (const tool of listed) expect(tool.inputSchema, tool.name).toMatchObject({ type: "object", properties: expect.any(Object) })
  })

  // @valibot/to-json-schema throws on what JSON Schema can't express, and one throw fails tools/list for every client.
  // tools/list converts leniently (server/mcp/schema.ts); converting strictly here catches a check that would silently
  // drop out of what clients see: put it after the advertised part of the pipe, as add_transactions does.
  it("advertises every check JSON Schema can express", () => {
    for (const tool of tools)
      for (const schema of [tool.inputSchema, tool.outputSchema])
        if (schema && "~standard" in schema && schema["~standard"].jsonSchema)
          expect(() => schema["~standard"].jsonSchema.input({ target: "draft-2020-12", libraryOptions: { errorMode: "throw" } }), tool.name).not.toThrow()
  })
})

describe("tools/call", () => {
  it("refuses input the app's validators reject before the tool runs", async () => {
    const { body } = await rpc("tools/call", {
      name: "add_transactions",
      arguments: { newAccount: { name: "Statement", currency: "XYZ", kind: "checking" }, rows: [{ date: "2026-02-30", amount: -1, description: "Rent" }] },
    })
    expect(body.result.isError).toBe(true)
    expect(body.result.content[0].text).toMatch(/Unknown currency|Dates must be YYYY-MM-DD/)
  })

  it("hands a tool's HTTPError to the model as a failed result", async () => {
    const { body } = await rpc("tools/call", { name: "get_finances", arguments: { view: "account" } })
    expect(body.result).toEqual({ isError: true, content: [{ type: "text", text: "[400] View account needs account: an id from view accounts." }] })
  })
})

describe("OAuth discovery", () => {
  it("answers a request without a token 401, pointing at the protected resource metadata", async () => {
    const { response } = await rpc("tools/list", {}, null)
    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toContain(`resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`)
  })

  it("refuses an unknown API key", async () => {
    expect((await rpc("tools/list", {}, "fin_unknown")).response.status).toBe(401)
  })

  it("names Better Auth as the authorization server for /mcp", async () => {
    const response = await app.request(`${origin}/.well-known/oauth-protected-resource/mcp`)
    expect(response.status).toBe(200)
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
    expect(await response.json()).toEqual({
      resource: `${origin}/mcp`,
      authorization_servers: [`${origin}/api/auth`],
      bearer_methods_supported: ["header"],
      scopes_supported: ["openid", "profile", "email"],
      resource_name: "ViteHub Finance",
    })
  })
})
