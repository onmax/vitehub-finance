import { eq } from "drizzle-orm"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { relativeChange, savingsRate } from "../../shared/overview-metrics"

vi.mock("vite-hub/database/drizzle", async () => ({ db: (await import("../database")).db }))
vi.mock("vite-hub/kv", async () => ({ kv: (await import("../database")).kv }))
vi.mock("#vitehub/env/server", () => ({ useServerEnv: () => ({ coingecko: { apiKey: { unseal: () => undefined } } }) }))
vi.mock("../../server/utils/dates", async (original) => ({
  ...(await original<typeof import("../../server/utils/dates")>()),
  todayIso: () => "2026-10-28",
}))

const { addAccount, addCategory, addTransaction, db, household, kv, migrate } = await import("../database")
const { balanceSnapshot, category } = await import("../../server/databases/config")
const { cashFlow, cashFlowSeries, updateTransaction } = await import("../../server/utils/transactions")
const { overview } = await import("../../server/utils/overview")
const options = { scope: "household", from: "2026-10-01", to: "2026-10-04" } satisfies Parameters<typeof cashFlow>[1]
const identity = (minor: number) => minor

beforeAll(async () => {
  await migrate()
  await kv.set("fx:EUR", { at: Date.now(), rates: { EUR: 1 } })
})

async function setup(id: string) {
  const [owner, partner] = await household(id, [`${id}-owner`, `${id}-partner`])
  if (!owner || !partner) throw new Error("Missing fixture members")
  const account = await addAccount({ householdId: id, ownerId: owner.userId, visibility: "household" })
  return { owner, partner, account }
}

describe("overview metric trends", () => {
  it("uses only visible transactions, honoring scope, hidden rows, excluded rows and date boundaries", async () => {
    const { owner, partner, account } = await setup("metric-privacy")
    const privateAccount = await addAccount({ householdId: owner.householdId, ownerId: owner.userId, visibility: "private" })
    const partnerAccount = await addAccount({ householdId: owner.householdId, ownerId: partner.userId, visibility: "household" })
    await addTransaction(account, { amountMinor: 1000 })
    await addTransaction(account, { amountMinor: 200, hidden: true })
    await addTransaction(privateAccount, { amountMinor: 300 })
    await addTransaction(partnerAccount, { amountMinor: 400 })
    await addTransaction(account, { amountMinor: 500, excluded: true })
    await addTransaction(account, { amountMinor: 600, date: "2026-09-30" })
    await addTransaction(account, { amountMinor: 700, date: "2026-10-05" })
    expect((await cashFlowSeries(partner, options, identity)).at(-1)).toMatchObject({ inMinor: 1400, outMinor: 0 })
    expect((await cashFlowSeries(owner, options, identity)).at(-1)).toMatchObject({ inMinor: 1900, outMinor: 0 })
    expect((await cashFlowSeries(owner, { ...options, scope: "me" }, identity)).at(-1)).toMatchObject({ inMinor: 1500, outMinor: 0 })
  })

  it("keeps refunds before spending in the running total, honors splits, and leaves transfers out", async () => {
    const { owner, account } = await setup("metric-refunds")
    const expense = await addCategory(owner.householdId, "Groceries")
    const transfer = await addCategory(owner.householdId, "Transfer")
    await db.update(category).set({ kind: "expense" }).where(eq(category.id, expense.id))
    await db.update(category).set({ kind: "transfer" }).where(eq(category.id, transfer.id))
    await addTransaction(account, { amountMinor: 300, categoryId: expense.id })
    const split = await addTransaction(account, { amountMinor: -500, date: "2026-10-03" })
    await updateTransaction(owner, split.id, { splits: [{ categoryId: expense.id, amountMinor: -400 }, { categoryId: null, amountMinor: -100 }] })
    await addTransaction(account, { amountMinor: 10000, categoryId: transfer.id })
    const series = await cashFlowSeries(owner, options, identity)
    expect(series).toEqual([
      { date: "2026-10-01", inMinor: 0, outMinor: 0 },
      { date: "2026-10-02", inMinor: 0, outMinor: 0 },
      { date: "2026-10-03", inMinor: 0, outMinor: 200 },
      { date: "2026-10-04", inMinor: 0, outMinor: 200 },
    ])
    expect(await cashFlow(owner, options, identity)).toEqual({ inMinor: 0, outMinor: 200 })
  })

  it("converts cumulative currency totals before rounding so the last point equals the headline", async () => {
    const { owner, account } = await setup("metric-fx")
    for (const date of ["2026-10-01", "2026-10-02"]) {
      await addTransaction(account, { amountMinor: 1, currency: "USD", date })
      await addTransaction(account, { amountMinor: -1, currency: "USD", date })
    }
    const convert = (minor: number, currency: string) => Math.round(minor * (currency === "USD" ? 0.6 : 1))
    const series = await cashFlowSeries(owner, options, convert)
    expect(series.at(-1)).toMatchObject({ inMinor: 1, outMinor: 1 })
    const { date, ...totals } = series.at(-1)!
    expect(totals).toEqual(await cashFlow(owner, options, convert))
    expect(date).toBe(options.to)
  })

  it("returns daily zeroes for an empty month", async () => {
    const { owner } = await setup("metric-empty")
    const series = await cashFlowSeries(owner, options, identity)
    expect(series).toHaveLength(4)
    expect(series.every((point) => point.inMinor === 0 && point.outMinor === 0)).toBe(true)
  })

  it("keeps recorded zero balances and compares the same dates last month", async () => {
    const { owner, account } = await setup("metric-overview")
    await db.insert(balanceSnapshot).values({ accountId: account.id, date: "2026-10-20", balanceMinor: 0 })
    await addTransaction(account, { amountMinor: 10000, date: "2026-10-10" })
    await addTransaction(account, { amountMinor: 8000, date: "2026-09-10" })
    await addTransaction(account, { amountMinor: 5000, date: "2026-09-29" })
    const result = await overview(owner, "household")
    expect(result.netWorthSeries[0]).toEqual({ date: "2026-10-20", valueMinor: 0 })
    expect(result.netWorthSeries).toHaveLength(9)
    expect(result.month.inMinor).toBe(10000)
    expect(result.month.previousInMinor).toBe(8000)
    expect(result.month.series.at(-1)).toMatchObject({ date: "2026-10-28", inMinor: result.month.inMinor, outMinor: result.month.outMinor })
  })

  it("returns only today's balance for a newly connected account", async () => {
    const { owner } = await setup("metric-new")
    expect((await overview(owner, "household")).netWorthSeries).toEqual([{ date: "2026-10-28", valueMinor: 0 }])
  })
})

describe("financial metric comparisons", () => {
  it("shows negative savings and leaves no-income rates undefined", () => {
    expect(savingsRate(10000, 12000)).toBe(-0.2)
    expect(savingsRate(10000, 0)).toBe(1)
    expect(savingsRate(0, 5000)).toBeNull()
    expect(savingsRate(0, 0)).toBeNull()
    expect(savingsRate(-100, 100)).toBeNull()
    expect(savingsRate(10000, 2000)! - savingsRate(10000, 3000)!).toBeCloseTo(0.1)
  })

  it("does not invent percentage growth from zero or reverse improvements from a negative balance", () => {
    expect(relativeChange(100, 0)).toBeNull()
    expect(relativeChange(-50, -100)).toBe(0.5)
    expect(relativeChange(80, 100)).toBe(-0.2)
  })
})
