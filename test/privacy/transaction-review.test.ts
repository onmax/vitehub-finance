import { eq } from "drizzle-orm"
import { beforeAll, describe, expect, it, vi } from "vitest"

const storageFailure = vi.hoisted(() => ({ write: false }))

vi.mock("vite-hub/database/drizzle", async () => ({ db: (await import("../database")).db }))
vi.mock("vite-hub/kv", async () => {
  const { kv } = await import("../database")
  return { kv: { ...kv, set: async (key: string, value: unknown) => { if (storageFailure.write) return [{ code: "KV_OPERATION_FAILED" }, undefined]; await kv.set(key, value); return [undefined, undefined] } } }
})
vi.mock("#vitehub/env/server", () => ({ useServerEnv: () => ({ coingecko: { apiKey: { unseal: () => undefined } } }) }))

const { addAccount, addCategory, addTransaction, db, household, kv, migrate } = await import("../database")
const { category, financialAccount, transaction, transactionReview } = await import("../../server/databases/config")
const { applyRule } = await import("../../server/utils/categorize")
const { bulkUpdateTransactions, cashFlow, flowRows, getTransaction, refundCandidates, searchTransactions, spendingByCategory, spendingByMonthCategory, undoTransactionBulk, updateTransaction } = await import("../../server/utils/transactions")

beforeAll(async () => {
  await migrate()
  await kv.set("fx:EUR", { at: Date.now(), rates: { EUR: 1 } })
})

async function setup(id: string) {
  const [owner, partner] = await household(id, [`${id}-owner`, `${id}-partner`])
  if (!owner || !partner) throw new Error("Missing fixture members")
  const shared = await addAccount({ householdId: id, ownerId: owner.userId, visibility: "household", householdPermission: "edit", balanceMinor: 10000 })
  const personal = await addAccount({ householdId: id, ownerId: owner.userId, visibility: "private" })
  const groceries = await addCategory(id, "Groceries")
  const home = await addCategory(id, "Home")
  return { owner, partner, shared, personal, groceries, home }
}
const options = { scope: "household", from: "2026-01-01", to: "2026-12-31" } as const
const convert = (minor: number) => minor

function raw(id: string) {
  return db.select().from(transaction).where(eq(transaction.id, id)).then((rows) => rows[0])
}

describe("review queues and assignment", () => {
  it("persists reviewer attribution, filters assigned rows, and never exposes private or hidden rows", async () => {
    const { owner, partner, shared, personal } = await setup("review")
    const visible = await addTransaction(shared)
    const hidden = await addTransaction(shared, { hidden: true })
    const secret = await addTransaction(personal)
    await updateTransaction(owner, visible.id, { assignedTo: partner.userId })
    expect((await searchTransactions(partner, { review: "assigned-to-me" })).items.map((row) => row.id)).toEqual([visible.id])
    await expect(updateTransaction(owner, hidden.id, { assignedTo: partner.userId })).rejects.toMatchObject({ status: 400 })
    await expect(updateTransaction(owner, secret.id, { assignedTo: partner.userId })).rejects.toMatchObject({ status: 400 })
    await expect(updateTransaction(partner, hidden.id, { reviewed: true })).rejects.toMatchObject({ status: 404 })
    await expect(updateTransaction(partner, secret.id, { reviewed: true })).rejects.toMatchObject({ status: 404 })
    const saved = await updateTransaction(partner, visible.id, { reviewed: true })
    expect(saved.review).toMatchObject({ reviewedBy: partner.userId, assignedTo: partner.userId })
    expect(saved.review?.reviewedAt).toBeTruthy()
    expect((await searchTransactions(partner, { review: "needs-review" })).items).toEqual([])
    expect((await searchTransactions(owner, { review: "needs-review" })).items.map((row) => row.id).sort()).toEqual([hidden.id, secret.id].sort())
    await updateTransaction(owner, visible.id, { hidden: true })
    expect((await getTransaction(owner, visible.id))?.review?.assignedTo).toBeNull()
  })

  it("requires edit access even for review and validates all bulk rows before changing any", async () => {
    const { owner, partner, shared, groceries } = await setup("bulk-privacy")
    const first = await addTransaction(shared)
    const hidden = await addTransaction(shared, { hidden: true })
    await expect(bulkUpdateTransactions(partner, { ids: [first.id, hidden.id], change: { categoryId: groceries.id } })).rejects.toMatchObject({ status: 404 })
    expect((await raw(first.id))?.categoryId).toBeNull()
    await db.update(financialAccount).set({ householdPermission: "view" }).where(eq(financialAccount.id, shared.id))
    await expect(updateTransaction(owner, first.id, { assignedTo: partner.userId })).rejects.toMatchObject({ status: 400, data: { code: "transactionAssigneeUnavailable" } })
    await expect(bulkUpdateTransactions(owner, { ids: [first.id], change: { assignedTo: partner.userId } })).rejects.toMatchObject({ status: 400 })
    expect((await updateTransaction(owner, first.id, { assignedTo: owner.userId })).review?.assignedTo).toBe(owner.userId)
    await expect(updateTransaction(partner, first.id, { reviewed: true })).rejects.toMatchObject({ status: 403 })
    await expect(bulkUpdateTransactions(partner, { ids: [first.id], change: { reviewed: true } })).rejects.toMatchObject({ status: 403 })
    expect((await getTransaction(owner, first.id))?.review?.reviewedAt).toBeNull()
  })
})

describe("category splits", () => {
  it("counts uncategorized money in, including uncategorized split allocations", async () => {
    const { owner, shared, home } = await setup("uncategorized-in")
    await addTransaction(shared, { amountMinor: 1000 })
    const original = await addTransaction(shared, { amountMinor: 2000 })
    await updateTransaction(owner, original.id, { splits: [{ categoryId: null, amountMinor: 1500 }, { categoryId: home.id, amountMinor: 500 }] })
    expect(await cashFlow(owner, options, convert)).toEqual({ inMinor: 2500, outMinor: 0 })
  })

  it("allocates each minor unit once without changing bank amount, date, dedupe key, row count, or balance", async () => {
    const { owner, shared, groceries, home } = await setup("split")
    const original = await addTransaction(shared, { amountMinor: -10001, categoryId: home.id })
    const saved = await updateTransaction(owner, original.id, { splits: [{ categoryId: groceries.id, amountMinor: -6000 }, { categoryId: home.id, amountMinor: -4001 }] })
    expect(saved.review?.splits).toHaveLength(2)
    expect(await raw(original.id)).toMatchObject({ amountMinor: -10001, date: original.date, dedupeKey: original.dedupeKey, categoryId: home.id })
    expect(await cashFlow(owner, options, convert)).toEqual({ inMinor: 0, outMinor: 10001 })
    expect(await spendingByCategory(owner, options, convert)).toEqual(new Map([[groceries.id, 6000], [home.id, 4001]]))
    expect(await spendingByMonthCategory(owner, options, convert)).toEqual(new Map([["2026-10", new Map([[groceries.id, 6000], [home.id, 4001]])]]))
    expect((await flowRows(owner, options)).reduce((sum, row) => sum + row.amountMinor, 0)).toBe(-10001)
    expect((await searchTransactions(owner, { category: groceries.id })).items.map((row) => row.id)).toEqual([original.id])
    expect((await db.select().from(transaction).where(eq(transaction.accountId, shared.id)))).toHaveLength(1)
    expect((await db.select().from(financialAccount).where(eq(financialAccount.id, shared.id)))[0]?.balanceMinor).toBe(10000)
    await updateTransaction(owner, original.id, { splits: null })
    expect(await spendingByCategory(owner, options, convert)).toEqual(new Map([[home.id, 10001]]))
  })

  it("protects manual splits and their removal from later automatic rules", async () => {
    const { owner, shared, groceries, home } = await setup("split-rule")
    const original = await addTransaction(shared, { description: "SPLIT merchant" })
    await updateTransaction(owner, original.id, { splits: [{ categoryId: groceries.id, amountMinor: -600 }, { categoryId: home.id, amountMinor: -400 }] })
    await applyRule(owner, { match: "SPLIT", categoryId: groceries.id, exclude: true })
    expect(await raw(original.id)).toMatchObject({ categoryLocked: true, categorySource: "manual", aiGuessId: null, excluded: false, categoryId: null })
    expect(await cashFlow(owner, options, convert)).toEqual({ inMinor: 0, outMinor: 1000 })
    await updateTransaction(owner, original.id, { splits: null })
    await applyRule(owner, { match: "SPLIT", categoryId: groceries.id, exclude: true })
    expect(await raw(original.id)).toMatchObject({ categoryLocked: true, categorySource: "manual", excluded: false, categoryId: null })
  })

  it("rejects mismatched sums, mixed signs, foreign categories and hidden edits", async () => {
    const { owner, partner, shared, groceries } = await setup("invalid-split")
    const original = await addTransaction(shared, { hidden: true, amountMinor: -1000 })
    const alien = await setup("alien-split")
    for (const splits of [
      [{ categoryId: groceries.id, amountMinor: -400 }, { categoryId: null, amountMinor: -500 }],
      [{ categoryId: groceries.id, amountMinor: -1500 }, { categoryId: null, amountMinor: 500 }],
      [{ categoryId: alien.home.id, amountMinor: -500 }, { categoryId: null, amountMinor: -500 }],
    ]) await expect(updateTransaction(owner, original.id, { splits })).rejects.toMatchObject({ status: 400 })
    await expect(updateTransaction(partner, original.id, { splits: [{ categoryId: groceries.id, amountMinor: -500 }, { categoryId: null, amountMinor: -500 }] })).rejects.toMatchObject({ status: 404 })
    expect((await getTransaction(owner, original.id))?.review?.splits).toEqual([])
  })
})

describe("bulk undo", () => {
  it("makes no changes when Undo storage is unavailable", async () => {
    const { owner, shared, groceries } = await setup("undo-storage")
    const original = await addTransaction(shared)
    storageFailure.write = true
    try {
      await expect(bulkUpdateTransactions(owner, { ids: [original.id], change: { categoryId: groceries.id } })).rejects.toMatchObject({ status: 503 })
    } finally { storageFailure.write = false }
    expect((await raw(original.id))?.categoryId).toBeNull()
  })

  it("restores each category and review snapshot and is bound to the actor", async () => {
    const { owner, partner, shared, groceries, home } = await setup("undo")
    const first = await addTransaction(shared, { categoryId: home.id, categorySource: "rule" })
    const second = await addTransaction(shared)
    await updateTransaction(owner, first.id, { reviewed: true })
    const before = (await getTransaction(owner, first.id))?.review
    const result = await bulkUpdateTransactions(owner, { ids: [first.id, second.id], change: { categoryId: groceries.id, reviewed: false } })
    expect(result.items).toHaveLength(2)
    expect(result.items.every((row) => row.categoryId === groceries.id && !row.review?.reviewedAt)).toBe(true)
    await expect(undoTransactionBulk(partner, result.undoToken)).rejects.toMatchObject({ status: 404 })
    await undoTransactionBulk(owner, result.undoToken)
    expect(await raw(first.id)).toMatchObject({ categoryId: home.id, categorySource: "rule", categoryLocked: false })
    expect((await getTransaction(owner, first.id))?.review?.reviewedAt).toBe(before?.reviewedAt)
    expect((await raw(second.id))?.categoryId).toBeNull()
    await expect(undoTransactionBulk(owner, result.undoToken)).rejects.toMatchObject({ status: 404 })
  })

  it("does not overwrite a category applied by a later automatic rule", async () => {
    const { owner, shared, groceries } = await setup("undo-rule")
    const original = await addTransaction(shared, { description: "LATER merchant" })
    const result = await bulkUpdateTransactions(owner, { ids: [original.id], change: { reviewed: true } })
    await applyRule(owner, { match: "LATER", categoryId: groceries.id, exclude: false })
    await expect(undoTransactionBulk(owner, result.undoToken)).rejects.toMatchObject({ status: 409 })
    expect(await raw(original.id)).toMatchObject({ categoryId: groceries.id, categorySource: "rule" })
  })

  it("refuses category Undo when a refund was linked after the bulk edit", async () => {
    const { owner, shared, groceries, home } = await setup("undo-refund")
    const original = await addTransaction(shared, { amountMinor: -5000, categoryId: groceries.id, date: "2026-10-01" })
    const result = await bulkUpdateTransactions(owner, { ids: [original.id], change: { categoryId: home.id } })
    const refund = await addTransaction(shared, { amountMinor: 1000, date: "2026-10-02" })
    await updateTransaction(owner, refund.id, { reimbursementOf: original.id })
    await expect(undoTransactionBulk(owner, result.undoToken)).rejects.toMatchObject({ status: 409 })
    expect((await raw(original.id))?.categoryId).toBe(home.id)
    expect((await raw(refund.id))?.categoryId).toBe(home.id)
    expect(await spendingByCategory(owner, options, convert)).toEqual(new Map([[home.id, 4000]]))
  })

  it("can undo review-only edits on an existing split", async () => {
    const { owner, shared, groceries } = await setup("undo-split-review")
    const original = await addTransaction(shared)
    await updateTransaction(owner, original.id, { splits: [{ categoryId: groceries.id, amountMinor: -600 }, { categoryId: null, amountMinor: -400 }] })
    const result = await bulkUpdateTransactions(owner, { ids: [original.id], change: { reviewed: true } })
    await undoTransactionBulk(owner, result.undoToken)
    const restored = await getTransaction(owner, original.id)
    expect(restored?.review?.reviewedAt).toBeNull()
    expect(restored?.review?.splits).toHaveLength(2)
  })

  it("does not overwrite a transaction edited after the bulk change", async () => {
    const { owner, shared, groceries } = await setup("undo-stale")
    const original = await addTransaction(shared)
    const result = await bulkUpdateTransactions(owner, { ids: [original.id], change: { categoryId: groceries.id } })
    await updateTransaction(owner, original.id, { note: "Changed after bulk" })
    await expect(undoTransactionBulk(owner, result.undoToken)).rejects.toMatchObject({ status: 409 })
    expect(await raw(original.id)).toMatchObject({ categoryId: groceries.id, note: "Changed after bulk" })
  })
})

describe("refund links", () => {
  it("nets a partial refund against category spending in its actual bank month and hides inaccessible links", async () => {
    const { owner, partner, shared, groceries } = await setup("refund")
    await db.update(category).set({ kind: "expense" }).where(eq(category.id, groceries.id))
    const original = await addTransaction(shared, { categoryId: groceries.id, amountMinor: -5000, date: "2026-09-25" })
    const refund = await addTransaction(shared, { amountMinor: 2000, date: "2026-10-02" })
    const saved = await updateTransaction(owner, refund.id, { reimbursementOf: original.id })
    expect(saved.categoryId).toBe(groceries.id)
    expect(saved.review?.reimbursementOf).toBe(original.id)
    expect((await refundCandidates(owner, original.id)).map((row) => row.id)).toEqual([refund.id])
    await expect(updateTransaction(owner, original.id, { splits: [{ categoryId: groceries.id, amountMinor: -2500 }, { categoryId: null, amountMinor: -2500 }] })).rejects.toMatchObject({ status: 400 })
    await expect(updateTransaction(owner, refund.id, { splits: [{ categoryId: groceries.id, amountMinor: 1000 }, { categoryId: null, amountMinor: 1000 }] })).rejects.toMatchObject({ status: 400 })
    expect(await cashFlow(owner, options, convert)).toEqual({ inMinor: 0, outMinor: 3000 })
    expect(await spendingByCategory(owner, options, convert)).toEqual(new Map([[groceries.id, 3000]]))
    expect(await raw(original.id)).toMatchObject({ amountMinor: -5000, date: "2026-09-25" })
    expect(await raw(refund.id)).toMatchObject({ amountMinor: 2000, date: "2026-10-02" })
    await updateTransaction(owner, original.id, { hidden: true })
    expect((await getTransaction(partner, refund.id))?.review?.reimbursementOf).toBeNull()
    expect((await refundCandidates(partner, refund.id)).map((row) => row.id)).not.toContain(original.id)
  })

  it("rejects new links between owner-only and shared audiences", async () => {
    const { owner, shared, personal, groceries } = await setup("refund-audience")
    const original = await addTransaction(shared, { amountMinor: -5000, categoryId: groceries.id, date: "2026-10-01" })
    const privateRefund = await addTransaction(personal, { amountMinor: 4500, date: "2026-10-02" })
    const hiddenRefund = await addTransaction(shared, { amountMinor: 1000, hidden: true, date: "2026-10-02" })
    for (const refund of [privateRefund, hiddenRefund]) {
      expect((await refundCandidates(owner, refund.id)).map((row) => row.id)).not.toContain(original.id)
      await expect(updateTransaction(owner, refund.id, { reimbursementOf: original.id })).rejects.toMatchObject({ status: 400, data: { code: "transactionRefundInvalid" } })
    }
  })

  it("ignores legacy private and hidden refund links in shared validation and Undo", async () => {
    const { owner, partner, shared, personal, groceries, home } = await setup("refund-legacy")
    const original = await addTransaction(shared, { amountMinor: -5000, categoryId: groceries.id, date: "2026-10-01" })
    const privateRefund = await addTransaction(personal, { amountMinor: 4500, categoryId: groceries.id, date: "2026-10-02" })
    const hiddenRefund = await addTransaction(shared, { amountMinor: 4500, hidden: true, categoryId: groceries.id, date: "2026-10-02" })
    for (const refund of [privateRefund, hiddenRefund]) await db.insert(transactionReview).values({ transactionId: refund.id, reimbursementOf: original.id, revision: crypto.randomUUID() })
    const bulk = await bulkUpdateTransactions(partner, { ids: [original.id], change: { reviewed: true } })
    await updateTransaction(owner, privateRefund.id, { reimbursementOf: null })
    await undoTransactionBulk(partner, bulk.undoToken)
    const visibleRefund = await addTransaction(shared, { amountMinor: 1000, date: "2026-10-03" })
    const linked = await updateTransaction(partner, visibleRefund.id, { reimbursementOf: original.id })
    expect(linked.review?.reimbursementOf).toBe(original.id)
    expect((await refundCandidates(partner, original.id)).map((row) => row.id)).toEqual([visibleRefund.id])
    expect((await refundCandidates(owner, original.id)).map((row) => row.id)).toEqual([visibleRefund.id])
    await updateTransaction(partner, visibleRefund.id, { reimbursementOf: null })
    await updateTransaction(partner, original.id, { categoryId: home.id })
    expect((await raw(original.id))?.categoryId).toBe(home.id)
  })

  it("rechecks the current audience after account sharing or hidden status changes", async () => {
    const { owner, shared, personal, groceries } = await setup("refund-sharing")
    const secondPersonal = await addAccount({ householdId: owner.householdId, ownerId: owner.userId, visibility: "private" })
    const original = await addTransaction(personal, { amountMinor: -5000, categoryId: groceries.id, date: "2026-10-01" })
    const refund = await addTransaction(secondPersonal, { amountMinor: 4500, date: "2026-10-02" })
    await updateTransaction(owner, refund.id, { reimbursementOf: original.id })
    expect((await getTransaction(owner, refund.id))?.review?.reimbursementOf).toBe(original.id)
    await db.update(financialAccount).set({ visibility: "household" }).where(eq(financialAccount.id, personal.id))
    expect((await getTransaction(owner, refund.id))?.review?.reimbursementOf).toBeNull()
    expect(await refundCandidates(owner, original.id)).toEqual([])
    const visibleRefund = await addTransaction(shared, { amountMinor: 1000, date: "2026-10-03" })
    expect((await updateTransaction(owner, visibleRefund.id, { reimbursementOf: original.id })).review?.reimbursementOf).toBe(original.id)
    await updateTransaction(owner, visibleRefund.id, { hidden: true })
    expect((await getTransaction(owner, visibleRefund.id))?.review?.reimbursementOf).toBeNull()
    expect(await refundCandidates(owner, original.id)).toEqual([])
  })

  it("rejects refunds above the original total, different currency and dates before the expense", async () => {
    const { owner, shared, groceries } = await setup("refund-invalid")
    const original = await addTransaction(shared, { categoryId: groceries.id, amountMinor: -5000, date: "2026-10-02" })
    const tooMuch = await addTransaction(shared, { amountMinor: 5001, date: "2026-10-03" })
    const foreign = await addTransaction(shared, { amountMinor: 1000, currency: "USD", date: "2026-10-03" })
    const early = await addTransaction(shared, { amountMinor: 1000, date: "2026-10-01" })
    for (const refund of [tooMuch, foreign, early]) await expect(updateTransaction(owner, refund.id, { reimbursementOf: original.id })).rejects.toMatchObject({ status: 400 })
  })
})
