import { eq } from "drizzle-orm"
import { beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("vite-hub/database/drizzle", async () => ({ db: (await import("../database")).db }))

const { addAccount, addCategory, addRule, addTransaction, db, household, migrate } = await import("../database")
const { transaction } = await import("../../server/databases/config")
const { applyRule, deleteRule, setRule } = await import("../../server/utils/categorize")

type Member = Awaited<ReturnType<typeof household>>[number]
type Account = Awaited<ReturnType<typeof addAccount>>

beforeAll(migrate)

const read = async (id: string) => (await db.select().from(transaction).where(eq(transaction.id, id)))[0]!

/**
 * Lucía's accounts as Pablo meets them: one shared for editing (with a row she hid), one shared to look at only, and a
 * private one. Pablo has his own account too.
 */
async function setUp(householdId: string) {
  const [lucia, pablo] = (await household(householdId, [`${householdId}-lucia`, `${householdId}-pablo`])) as [Member, Member]
  const accounts = {
    shared: await addAccount({ householdId, ownerId: lucia.userId, visibility: "household", householdPermission: "edit" }),
    viewOnly: await addAccount({ householdId, ownerId: lucia.userId, visibility: "household", householdPermission: "view" }),
    personal: await addAccount({ householdId, ownerId: lucia.userId, visibility: "private" }),
    pablos: await addAccount({ householdId, ownerId: pablo.userId, visibility: "household" }),
  }
  return { lucia, pablo, accounts }
}

const streaming = (account: Account, values: Partial<typeof transaction.$inferInsert> = {}) =>
  addTransaction(account, { description: "STREAMFLIX monthly", ...values })

describe("a rule Pablo applies", () => {
  it("files only the rows he may edit and see", async () => {
    const { pablo, accounts } = await setUp("apply")
    const category = await addCategory("apply", "Subscriptions")
    const rows = {
      shared: await streaming(accounts.shared),
      hidden: await streaming(accounts.shared, { hidden: true }),
      viewOnly: await streaming(accounts.viewOnly),
      personal: await streaming(accounts.personal),
      pablos: await streaming(accounts.pablos),
    }
    await applyRule(pablo, { match: "streamflix", categoryId: category.id, exclude: true })
    for (const id of [rows.shared.id, rows.pablos.id]) expect(await read(id)).toMatchObject({ categoryId: category.id, excluded: true })
    for (const id of [rows.hidden.id, rows.viewOnly.id, rows.personal.id]) expect(await read(id)).toMatchObject({ categoryId: null, excluded: false })
  })
})

describe("an excluding rule Pablo removes or turns off", () => {
  async function excluded(householdId: string) {
    const setup = await setUp(householdId)
    const { accounts } = setup
    const byRule = { excluded: true, excludeSource: "rule" as const }
    const rows = {
      shared: await streaming(accounts.shared, byRule),
      hidden: await streaming(accounts.shared, { ...byRule, hidden: true }),
      viewOnly: await streaming(accounts.viewOnly, byRule),
      personal: await streaming(accounts.personal, byRule),
      pablos: await streaming(accounts.pablos, byRule),
    }
    const rule = await addRule(householdId, { match: "streamflix", exclude: true })
    return { ...setup, rows, rule }
  }

  async function expectOnlyHisBack(rows: Awaited<ReturnType<typeof excluded>>["rows"]) {
    for (const id of [rows.shared.id, rows.pablos.id]) expect(await read(id)).toMatchObject({ excluded: false, excludeSource: null })
    for (const id of [rows.hidden.id, rows.viewOnly.id, rows.personal.id]) expect(await read(id)).toMatchObject({ excluded: true, excludeSource: "rule" })
  }

  it("brings back only the rows he may edit and see, when he deletes it", async () => {
    const { pablo, rows, rule } = await excluded("delete")
    expect(await deleteRule(pablo, rule.id)).not.toBeNull()
    await expectOnlyHisBack(rows)
  })

  it("brings back only the rows he may edit and see, when he turns exclusion off", async () => {
    const { pablo, rows, rule } = await excluded("disable")
    const category = await addCategory("disable", "Subscriptions")
    await setRule(pablo, rule.id, { categoryId: category.id, exclude: false })
    await expectOnlyHisBack(rows)
    // The new category reaches the same rows only.
    expect(await read(rows.shared.id)).toMatchObject({ categoryId: category.id })
    for (const id of [rows.hidden.id, rows.viewOnly.id, rows.personal.id]) expect(await read(id)).toMatchObject({ categoryId: null })
  })

  it("brings back the owner's own hidden and private rows when she deletes it", async () => {
    const { lucia, rows, rule } = await excluded("owner")
    await deleteRule(lucia, rule.id)
    for (const id of [rows.shared.id, rows.hidden.id, rows.viewOnly.id, rows.personal.id]) expect(await read(id)).toMatchObject({ excluded: false })
    // Pablo's account is shared, and every member may edit their own household's shared accounts unless he said "view".
    expect(await read(rows.pablos.id)).toMatchObject({ excluded: false })
  })
})
