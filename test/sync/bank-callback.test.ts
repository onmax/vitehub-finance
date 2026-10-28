import { eq } from "drizzle-orm"
import { H3 } from "h3"
import { beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("vite-hub/database/drizzle", async () => ({ db: (await import("../database")).db }))
vi.mock("vite-hub/kv", async () => ({ kv: (await import("../database")).kv }))
vi.mock("#vitehub/env/server", () => ({
  useServerEnv: () => ({
    finance: { encryptionKey: { unseal: () => "a synthetic key for tests only" } },
    enableBanking: { appId: "synthetic-app", privateKey: { unseal: () => "synthetic-key" } },
  }),
}))
vi.mock("#dispatch", () => ({ dispatchSync: async () => {} }))
vi.mock("evlog/nitro/v3", () => ({ useLogger: () => ({ set() {}, warn() {}, error() {} }) }))
vi.mock("../../server/demo/mode", () => ({ isDemo: () => false, isDemoPerson: () => false }))
// Whoever the test says is signed in, and whatever the bank's session holds.
const state = vi.hoisted(() => ({ userId: "", accounts: [] as unknown[] }))
vi.mock("../../server/utils/identity", async (original) => ({
  ...(await original<typeof import("../../server/utils/identity")>()),
  identify: async () => ({ userId: state.userId }),
}))
vi.mock("../../server/providers/enable-banking", async (original) => ({
  ...(await original<typeof import("../../server/providers/enable-banking")>()),
  createSession: async () => ({ credentials: { sessionId: "synthetic", accounts: [] }, accounts: state.accounts, consentExpiresAt: null }),
  deleteSession: async () => {},
}))

const { addConnection, db, household, kv, migrate } = await import("../database")
const { connection } = await import("../../server/databases/config")
const { default: callback } = await import("../../server/api/connect/callback.get")

beforeAll(migrate)

const app = new H3().get("/api/connect/callback", callback)

/** The bank sends the person back; returns where the app redirects them. */
async function comeBack(connectionId: string, userId: string) {
  const key = crypto.randomUUID().replaceAll("-", "")
  await kv.set(`eb-state:${key}`, { connectionId, userId, at: Date.now() })
  state.userId = userId
  const response = await app.request(`/api/connect/callback?state=${key}&code=synthetic`)
  return new URL(response.headers.get("location")!, "http://localhost").searchParams
}

const find = async (id: string) => (await db.select().from(connection).where(eq(connection.id, id)))[0]

describe("bank callback when the bank shares no accounts", () => {
  it("leaves no half-linked connection behind and names the restricted-app cause", async () => {
    const [person] = await household("callback-new", ["callback-new-a"])
    const link = await addConnection({ householdId: person!.householdId, ownerId: person!.userId, provider: "enable_banking", status: "pending" })
    state.accounts = []
    const query = await comeBack(link.id, person!.userId)
    expect(query.get("error")).toMatch(/shared no accounts/)
    expect(query.get("error")).toMatch(/control panel/)
    // A failed new link is gone, like an abandoned one, so no sync turns it into "no credentials".
    expect(await find(link.id)).toBeUndefined()
  })

  it("keeps a working connection as it was when reconnecting it fails", async () => {
    const [person] = await household("callback-old", ["callback-old-a"])
    const link = await addConnection({ householdId: person!.householdId, ownerId: person!.userId, provider: "enable_banking", status: "expired" })
    state.accounts = []
    await comeBack(link.id, person!.userId)
    const row = await find(link.id)
    expect(row?.status).toBe("expired")
    expect(row?.lastError).toMatch(/shared no accounts/)
  })
})
