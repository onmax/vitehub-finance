import { eq } from "drizzle-orm"
import { beforeAll, describe, expect, it, vi } from "vitest"
import type { ProviderAccount } from "../../server/providers/types"

vi.mock("vite-hub/database/drizzle", async () => ({ db: (await import("../database")).db }))
vi.mock("vite-hub/kv", async () => ({ kv: (await import("../database")).kv }))
vi.mock("#vitehub/env/server", () => ({
  useServerEnv: () => ({
    finance: { encryptionKey: { unseal: () => "a synthetic key for tests only" } },
    enableBanking: { appId: undefined, privateKey: { unseal: () => undefined } },
    coingecko: { apiKey: { unseal: () => undefined } },
  }),
}))
vi.mock("../../server/demo/mode", () => ({ isDemo: () => false, isDemoPerson: () => false }))
vi.mock("../../server/utils/ai-gateway", () => ({ routeFor: async () => null }))
vi.mock("../../server/utils/fx", async (original) => ({
  ...(await original<typeof import("../../server/utils/fx")>()),
  rates: async () => ({ EUR: 1 }),
  converterTo: async () => (minor: number) => minor,
}))
// The bank answers whatever the test says.
const bank = vi.hoisted(() => ({ accounts: [] as ProviderAccount[] }))
vi.mock("../../server/providers/index", async (original) => ({
  ...(await original<typeof import("../../server/providers/index")>()),
  providerFor: () => async () => ({ accounts: bank.accounts }),
}))
// Every log line a sync writes, as JSON.
const logged = vi.hoisted(() => [] as string[])
vi.mock("evlog", async (original) => ({
  ...(await original<typeof import("evlog")>()),
  createLogger: (context: unknown) => {
    const record = (...args: unknown[]) => void logged.push(JSON.stringify(args, (_key, value) => (value instanceof Error ? { message: value.message, stack: value.stack } : value)))
    record(context)
    return { set: record, warn: record, error: record, info: record, emit: () => {} }
  },
}))

const { addAccount, addConnection, db, household, migrate } = await import("../database")
const { connection } = await import("../../server/databases/config")
const { seal } = await import("../../server/utils/crypto")
const { listConnections, recentRuns } = await import("../../server/utils/connections")
const { needsAttention } = await import("../../server/utils/overview")
const { syncConnection } = await import("../../server/utils/sync")
const english = (await import("../../app/locales/en.json")).default as Record<string, string>

beforeAll(migrate)

// Words only Lucía may see: her private account's name and what her bank said about it.
const SECRET = ["Secret savings", "IBAN ES00", "blocked"]
const expectNoSecret = (text: string | null | undefined) => {
  for (const word of SECRET) expect(text ?? "").not.toContain(word)
}

/** Lucía's bank: one account shared with the household, one private. Pablo sees the connection through the shared one. */
async function setUp(householdId: string) {
  const [lucia, pablo] = await household(householdId, [`${householdId}-lucia`, `${householdId}-pablo`])
  const link = await addConnection({ householdId, ownerId: lucia!.userId, provider: "enable_banking", credentials: await seal({ sessionId: "synthetic" }) })
  await addAccount({ householdId, ownerId: lucia!.userId, connectionId: link.id, externalId: "joint", name: "Joint", visibility: "household" })
  await addAccount({ householdId, ownerId: lucia!.userId, connectionId: link.id, externalId: "secret", name: "Secret savings", visibility: "private" })
  return { lucia: lucia!, pablo: pablo!, link }
}

const joint: ProviderAccount = { externalId: "joint", name: "Joint", kind: "checking", currency: "EUR", balanceMinor: 1000, transactions: [] }
const secret: ProviderAccount = { externalId: "secret", name: "Secret savings", kind: "savings", currency: "EUR", error: "Account IBAN ES00 1234 is blocked by the bank." }

describe("whose connections a member sees", () => {
  it("lists only their own in the personal view, and a partner's shared bank in the household view", async () => {
    const { lucia, pablo, link } = await setUp("views")
    expect((await listConnections(pablo, { scope: "me" })).map((row) => row.id)).toEqual([])
    expect((await listConnections(pablo, { scope: "household" })).map((row) => row.id)).toEqual([link.id])
    expect((await listConnections(lucia, { scope: "me" })).map((row) => row.id)).toEqual([link.id])
  })
})

describe("a sync where a private account fails", () => {
  it("tells members a generic, translatable reason, and the owner the details in the sync runs", async () => {
    const { lucia, pablo, link } = await setUp("partial")
    bank.accounts = [joint, secret]
    logged.splice(0)
    expect((await syncConnection(link.id, "manual")).added).toBe(0)

    const [seen] = await listConnections(pablo)
    expect(seen).toMatchObject({ id: link.id, lastErrorCode: "providerPartial", lastError: english.providerPartial })
    expect(seen!.accounts.map((account) => account.name)).toEqual(["Joint"])
    expectNoSecret((await listConnections(lucia))[0]!.lastError)

    const [run] = await recentRuns(link.id)
    expect(run!.error).toContain("Secret savings")
    expectNoSecret(logged.join("\n"))
    // The logs say which account failed by id, with the code.
    expect(logged.join("\n")).toMatch(/"failures":\[\{"accountId":"account-\d+","code":"providerUnavailable"\}\]/)
  })

  it("keeps the details out of the connection and the logs when every account fails", async () => {
    const { pablo, link } = await setUp("failed")
    bank.accounts = [{ ...joint, error: "Account IBAN ES00 9999 is blocked by the bank." }, secret]
    logged.splice(0)
    await syncConnection(link.id, "manual").catch(() => {})

    const [attention] = await needsAttention(pablo, "household")
    expect(attention).toMatchObject({ id: link.id, status: "error", lastErrorCode: "providerUnavailable", lastError: english.providerUnavailable })
    const [stored] = await db.select().from(connection).where(eq(connection.id, link.id))
    expectNoSecret(stored!.lastError)
    expect((await recentRuns(link.id))[0]!.error).toContain("Secret savings")
    expectNoSecret(logged.join("\n"))
    expect(logged.join("\n")).toContain("providerUnavailable")
  })
})

describe("a failure stored before syncs kept it generic", () => {
  it("reaches members as its code's copy and the owner as it was", async () => {
    const { lucia, pablo, link } = await setUp("legacy")
    const old = "Couldn't sync 1 of 2 accounts. Secret savings: Account IBAN ES00 1234 is blocked by the bank."
    await db.update(connection).set({ status: "error", lastError: old, lastErrorCode: "providerPartial" }).where(eq(connection.id, link.id))
    expect((await listConnections(pablo))[0]!.lastError).toBe(english.providerPartial)
    expect((await needsAttention(pablo, "household"))[0]!.lastError).toBe(english.providerPartial)
    expect((await listConnections(lucia))[0]!.lastError).toBe(old)
  })
})
