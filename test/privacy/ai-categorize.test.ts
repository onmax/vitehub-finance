import { inArray } from "drizzle-orm"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("vite-hub/database/drizzle", async () => ({ db: (await import("../database")).db }))
vi.mock("../../server/demo/mode", () => ({ isDemo: () => false, isDemoPerson: () => false }))
// Whose key answers is the test's choice; Jev itself is a stub that records what it was shown and is never sure.
const route = vi.hoisted(() => ({ source: "household" as "household" | "server" }))
const shown = vi.hoisted(() => [] as string[])
vi.mock("../../server/utils/ai-gateway", () => ({ routeFor: async () => ({ route: "typesafe", source: route.source, gateway: {} }) }))
vi.mock("../../server/utils/ai-categorize-core", async (original) => ({
  ...(await original<typeof import("../../server/utils/ai-categorize-core")>()),
  classify: async (rows: Array<{ id: string }>) => {
    shown.push(...rows.map((row) => row.id))
    return { decisions: rows.map((row) => ({ id: row.id, categoryId: null, guessId: null })), usage: { calls: 1, failedCalls: 0, inputTokens: 0, outputTokens: 0 }, unsent: [] }
  },
}))

const { addAccount, addTransaction, household, migrate } = await import("../database")
const { financialAccount } = await import("../../server/databases/config")
const { categorizeWithAi } = await import("../../server/utils/ai-categorize")

beforeAll(migrate)
beforeEach(() => void shown.splice(0))

/** Lucía's household: a shared account with a row she hid, one shared to look at only, a private one; and Pablo's. */
async function setUp(householdId: string) {
  const [lucia, pablo] = await household(householdId, [`${householdId}-lucia`, `${householdId}-pablo`])
  const shared = await addAccount({ householdId, ownerId: lucia!.userId, visibility: "household", householdPermission: "edit" })
  const viewOnly = await addAccount({ householdId, ownerId: lucia!.userId, visibility: "household", householdPermission: "view" })
  const personal = await addAccount({ householdId, ownerId: lucia!.userId, visibility: "private" })
  const pablos = await addAccount({ householdId, ownerId: pablo!.userId, visibility: "household" })
  const rows = {
    shared: (await addTransaction(shared, { description: "Groceries" })).id,
    hidden: (await addTransaction(shared, { description: "A gift", hidden: true })).id,
    viewOnly: (await addTransaction(viewOnly, { description: "Bakery" })).id,
    personal: (await addTransaction(personal, { description: "Therapy" })).id,
    pablos: (await addTransaction(pablos, { description: "Hardware store" })).id,
  }
  return { lucia: lucia!, pablo: pablo!, accounts: { shared, viewOnly, personal, pablos }, rows }
}

describe("AI categories someone asks for", () => {
  it("send only rows the caller may both see and edit", async () => {
    const { pablo, rows } = await setUp("button")
    route.source = "household"
    await categorizeWithAi("button", { caller: pablo }, { limit: 200 })
    expect(shown.sort()).toEqual([rows.shared, rows.pablos].sort())
  })

  it("send the caller's own hidden and private rows when they ask", async () => {
    const { lucia, rows } = await setUp("own")
    route.source = "household"
    await categorizeWithAi("own", { caller: lucia }, { limit: 200 })
    expect(shown.sort()).toEqual(Object.values(rows).sort())
  })
})

describe("AI categories during a sync", () => {
  it("never send hidden rows, nor a private account's through the household's key", async () => {
    const { accounts, rows } = await setUp("sync-household")
    route.source = "household"
    const touched = inArray(financialAccount.id, [accounts.shared.id, accounts.personal.id, accounts.viewOnly.id])
    await categorizeWithAi("sync-household", { accounts: touched }, { limit: 400 })
    expect(shown.sort()).toEqual([rows.shared, rows.viewOnly].sort())
  })

  it("send a private account's rows through the server's own route, still without hidden ones", async () => {
    const { accounts, rows } = await setUp("sync-server")
    route.source = "server"
    const touched = inArray(financialAccount.id, [accounts.shared.id, accounts.personal.id])
    await categorizeWithAi("sync-server", { accounts: touched }, { limit: 400 })
    expect(shown.sort()).toEqual([rows.shared, rows.personal].sort())
  })
})
