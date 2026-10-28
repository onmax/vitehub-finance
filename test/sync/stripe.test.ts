import { eq } from "drizzle-orm"
import { H3 } from "h3"
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest"
import type { Member } from "../../server/utils/identity"

vi.mock("vite-hub/database/drizzle", async () => ({ db: (await import("../database")).db }))
vi.mock("vite-hub/kv", async () => ({ kv: (await import("../database")).kv }))
vi.mock("#vitehub/env/server", () => ({ useServerEnv: () => ({
  finance: { encryptionKey: { unseal: () => "synthetic encryption key for tests only" }, origin: "https://finance.example.test" },
  enableBanking: { appId: undefined, privateKey: { unseal: () => undefined } },
}) }))
vi.mock("#dispatch", () => ({ dispatchSync: async () => {} }))
vi.mock("evlog/nitro/v3", () => ({ useLogger: () => ({ set() {}, warn() {}, error() {} }) }))
vi.mock("../../server/demo/mode", () => ({ isDemo: () => false, isDemoPerson: () => false, refuseDemoPerson() {} }))
vi.mock("../../server/utils/ai-gateway", () => ({ routeFor: async () => null }))
vi.mock("../../server/utils/fx", async (original) => ({
  ...(await original<typeof import("../../server/utils/fx")>()),
  converterTo: async () => (minor: number) => minor,
  ratesWithTime: async () => ({ rates: { EUR: 1 }, at: Date.now() }),
}))
vi.mock("../../server/utils/connections", async (original) => ({
  ...(await original<typeof import("../../server/utils/connections")>()),
  rememberOrigin: async () => {},
}))
const caller = vi.hoisted(() => ({ member: null as Member | null }))
vi.mock("../../server/utils/identity", async (original) => ({
  ...(await original<typeof import("../../server/utils/identity")>()),
  requireMember: async () => {
    if (!caller.member) throw new Error("No synthetic caller")
    return caller.member
  },
}))

const { addAccount, addCategory, addConnection, db, household, migrate } = await import("../database")
const { connection, financialAccount, transaction } = await import("../../server/databases/config")
const { insertTransactions, syncConnection } = await import("../../server/utils/sync")
const { seal, unseal } = await import("../../server/utils/crypto")
const { forecast } = await import("../../server/utils/forecast")
const { stripeTransaction } = await import("../../server/providers/stripe")
const { default: disconnectStripe } = await import("../../server/api/connections/[id].delete")
const { default: connectStripe } = await import("../../server/api/connect/stripe.post")

beforeAll(migrate)
afterEach(() => vi.unstubAllGlobals())

const payment = { grossMinor: 10000, feeMinor: 300, netMinor: 9700, status: "pending" as const,
  availableOn: "2026-10-03T00:00:00.000Z", type: "charge", reportingCategory: "charge", sourceId: "ch_sale" }

describe("Stripe persistence", () => {
  it("keeps Stripe settlement funds outside cash forecasts even if the account kind is changed", async () => {
    const [owner] = await household("stripe-forecast", ["stripe-forecast-owner"])
    const link = await addConnection({ householdId: owner!.householdId, ownerId: owner!.userId, provider: "stripe" })
    const stripeAccount = await addAccount({ householdId: owner!.householdId, ownerId: owner!.userId, connectionId: link.id,
      kind: "checking", balanceMinor: 900000, paymentBalance: { availableMinor: 500000, pendingMinor: 400000 } })
    const bank = await addAccount({ householdId: owner!.householdId, ownerId: owner!.userId, kind: "checking", balanceMinor: 10000 })
    const result = await forecast(owner!, "me", 3)
    expect(result.accounts.map(account => account.id)).toEqual([bank.id])
    expect(result.planning.accounts.map(account => account.id)).not.toContain(stripeAccount.id)
    expect(result.startMinor).toBe(10000)
  })

  it("updates settlement without duplicating net receipts or touching personal edits", async () => {
    const [owner] = await household("stripe-ledger", ["stripe-owner"])
    const account = await addAccount({ householdId: owner!.householdId, ownerId: owner!.userId, kind: "other" })
    const category = await addCategory(owner!.householdId, "Sales")
    const row = { externalId: "txn_sale", dedupeKey: "stripe:txn_sale", date: "2026-10-01", amountMinor: 9700, currency: "EUR", description: "Stripe charge", payment }
    expect(await insertTransactions(account, [row], [])).toBe(1)
    await db.update(transaction).set({ categoryId: category.id, categoryLocked: true, categorySource: "manual", note: "My invoice", hidden: true, excluded: true, excludeSource: "manual" })
      .where(eq(transaction.accountId, account.id))
    expect(await insertTransactions(account, [{ ...row, payment: { ...payment, status: "available" } }], [])).toBe(0)
    const rows = await db.select().from(transaction).where(eq(transaction.accountId, account.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ amountMinor: 9700, status: "booked", categoryId: category.id, categoryLocked: true,
      categorySource: "manual", note: "My invoice", hidden: true, excluded: true, excludeSource: "manual", payment: { ...payment, status: "available" } })
  })

  it("preserves the bank's amount, date and dedupe behavior", async () => {
    const [owner] = await household("stripe-bank-regression", ["stripe-bank-owner"])
    const account = await addAccount({ householdId: owner!.householdId, ownerId: owner!.userId })
    const row = { externalId: "bank-sale", date: "2026-10-01", amountMinor: -1234, currency: "EUR", description: "Bank purchase" }
    expect(await insertTransactions(account, [row], [])).toBe(1)
    expect(await insertTransactions(account, [{ ...row, date: "2026-10-02", amountMinor: -9999 }], [])).toBe(0)
    const [saved] = await db.select().from(transaction).where(eq(transaction.accountId, account.id))
    expect(saved).toMatchObject({ amountMinor: -1234, date: "2026-10-01", dedupeKey: "id:bank-sale", payment: null })
  })

  it("fits processor inserts inside D1's 100-parameter statement limit", async () => {
    const [owner] = await household("stripe-d1", ["stripe-d1-owner"])
    const account = await addAccount({ householdId: owner!.householdId, ownerId: owner!.userId })
    const original = db.$client.execute.bind(db.$client)
    const sizes: number[] = []
    const spy = vi.spyOn(db.$client, "execute").mockImplementation(async (statement) => {
      if (typeof statement !== "string") sizes.push(Object.keys(statement.args ?? {}).length)
      return original(statement)
    })
    try {
      expect(await insertTransactions(account, Array.from({ length: 9 }, (_, index) => ({
        externalId: `txn_${index}`, date: "2026-10-01", amountMinor: 9700, currency: "EUR", description: "Stripe charge", payment,
      })), [])).toBe(9)
      expect(sizes.length).toBeGreaterThan(0)
      expect(Math.max(...sizes)).toBeLessThanOrEqual(100)
    } finally { spy.mockRestore() }
  })

  it("refreshes pending rows older than the sync window and zeros a currency omitted by Stripe", async () => {
    const [owner] = await household("stripe-sync", ["stripe-sync-owner"])
    const link = await addConnection({ householdId: owner!.householdId, ownerId: owner!.userId, provider: "stripe", lastSyncedAt: new Date(),
      credentials: await seal({ key: "rk_live_synthetic", accountId: "acct_merchant" }) })
    const account = await addAccount({ householdId: owner!.householdId, ownerId: owner!.userId, connectionId: link.id, kind: "other",
      externalId: "acct_merchant:EUR", currency: "EUR", balanceMinor: 9700, paymentBalance: { availableMinor: 0, pendingMinor: 9700 } })
    const jpy = await addAccount({ householdId: owner!.householdId, ownerId: owner!.userId, connectionId: link.id, kind: "other",
      externalId: "acct_merchant:JPY", currency: "JPY", balanceMinor: 1000 })
    await insertTransactions(account, [{ externalId: "txn_sale", dedupeKey: "stripe:txn_sale", date: "2026-01-01", amountMinor: 9700, currency: "EUR", description: "Stripe charge", payment }], [])
    const paths: string[] = []
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      paths.push(url.pathname)
      return Response.json(url.pathname.endsWith("/balance")
        ? { livemode: true, available: [{ currency: "eur", amount: 9700 }], pending: [] }
        : url.pathname.endsWith("/txn_sale")
          ? { id: "txn_sale", amount: 10000, fee: 300, net: 9700, currency: "eur", created: 1767225600, available_on: 1767398400,
              status: "available", type: "charge", reporting_category: "charge", source: "ch_sale" }
          : { data: [], has_more: false })
    })
    expect((await syncConnection(link.id, "schedule")).added).toBe(0)
    expect(paths).toContain("/v1/balance_transactions/txn_sale")
    const [saved] = await db.select().from(transaction).where(eq(transaction.accountId, account.id))
    expect(saved).toMatchObject({ status: "booked", payment: { status: "available" } })
    const [balance] = await db.select().from(financialAccount).where(eq(financialAccount.id, account.id))
    expect(balance).toMatchObject({ balanceMinor: 9700, paymentBalance: { availableMinor: 9700, pendingMinor: 0 }, kind: "other" })
    const [empty] = await db.select().from(financialAccount).where(eq(financialAccount.id, jpy.id))
    expect(empty).toMatchObject({ balanceMinor: 0, paymentBalance: { availableMinor: 0, pendingMinor: 0 } })
  })

  it("keeps net fees and the original charge date in the app adapter", () => {
    expect(stripeTransaction({ id: "txn_sale", created: 1790812800, currency: "JPY", grossMinor: 1500, feeMinor: 50, netMinor: 1450,
      availableOn: 1790985600, status: "pending", type: "charge", reportingCategory: "charge", sourceId: "ch_sale" }))
      .toMatchObject({ externalId: "txn_sale", amountMinor: 1450, date: "2026-10-01", currency: "JPY", transfer: false,
        payment: { grossMinor: 1500, feeMinor: 50, netMinor: 1450, status: "pending" } })
  })
})

describe("Stripe connection", () => {
  const app = new H3().post("/api/connect/stripe", connectStripe).delete("/api/connections/:id", disconnectStripe)
  const post = (key: string) => app.request("/api/connect/stripe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) })

  it("keeps history when disconnected and clears the provider settlement balance", async () => {
    const [owner] = await household("stripe-disconnect", ["stripe-disconnect-owner"])
    caller.member = owner!
    const link = await addConnection({ householdId: owner!.householdId, ownerId: owner!.userId, provider: "stripe" })
    const account = await addAccount({ householdId: owner!.householdId, ownerId: owner!.userId, connectionId: link.id,
      kind: "other", balanceMinor: 9700, paymentBalance: { availableMinor: 0, pendingMinor: 9700 } })
    await insertTransactions(account, [{ externalId: "txn_history", date: "2026-10-01", amountMinor: 9700,
      currency: "EUR", description: "Stripe charge", payment }], [])
    expect((await app.request(`/api/connections/${link.id}?keepAccounts=1`, { method: "DELETE" })).status).toBe(200)
    const [kept] = await db.select().from(financialAccount).where(eq(financialAccount.id, account.id))
    expect(kept).toMatchObject({ connectionId: null, externalId: null, paymentBalance: null, balanceMinor: 9700 })
    expect(await db.select().from(transaction).where(eq(transaction.accountId, account.id))).toHaveLength(1)
    expect(await db.select().from(connection).where(eq(connection.id, link.id))).toEqual([])
  })

  it("reuses the merchant connection after key rotation and stores credentials sealed", async () => {
    const [owner] = await household("stripe-connect", ["stripe-connect-owner"])
    caller.member = owner!
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return Response.json(url.pathname.endsWith("/account") ? { id: "acct_rotated" }
        : url.pathname.endsWith("/balance") ? { livemode: true, available: [], pending: [] } : { data: [], has_more: false })
    })
    expect((await post("rk_live_first")).status).toBe(200)
    expect((await post("rk_live_second")).status).toBe(200)
    const rows = await db.select().from(connection).where(eq(connection.householdId, owner!.householdId))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.externalId).toBe("acct_rotated")
    expect(rows[0]!.credentials).not.toContain("rk_live_")
    expect(await unseal(rows[0]!.credentials)).toEqual({ key: "rk_live_second", accountId: "acct_rotated" })
  })

  it("rejects non-restricted and test keys without saving a connection", async () => {
    const [owner] = await household("stripe-invalid", ["stripe-invalid-owner"])
    caller.member = owner!
    for (const key of ["sk_live_synthetic", "pk_live_synthetic", "rk_test_synthetic"]) {
      const response = await post(key)
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ data: { code: "errorStripeLiveKey" } })
    }
    expect(await db.select().from(connection).where(eq(connection.householdId, owner!.householdId))).toEqual([])
  })
})
