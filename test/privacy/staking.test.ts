import { beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("vite-hub/database/drizzle", async () => ({ db: (await import("../database")).db }))
vi.mock("vite-hub/kv", async () => ({ kv: (await import("../database")).kv }))
vi.mock("#vitehub/env/server", () => ({ useServerEnv: () => ({ coingecko: { apiKey: { unseal: () => undefined } } }) }))
// Prices and rates without the network: a NIM is worth one euro.
vi.mock("../../server/utils/prices", async (original) => ({
  ...(await original<typeof import("../../server/utils/prices")>()),
  quotes: async (symbols: string[]) => Object.fromEntries(symbols.map((symbol) => [symbol.toUpperCase(), 1])),
}))
vi.mock("../../server/utils/fx", async (original) => ({
  ...(await original<typeof import("../../server/utils/fx")>()),
  rates: async () => ({ EUR: 1 }),
  converterTo: async () => (minor: number) => minor,
}))

const { addAccount, addTransaction, db, household, migrate } = await import("../database")
const { stakingEvent, stakingPosition } = await import("../../server/databases/config")
const { accountDetail } = await import("../../server/utils/accounts")
const { overview } = await import("../../server/utils/overview")

// NIM has 5 decimals: 100 coins are 10_000_000 base units.
const coins = (amount: number) => String(amount * 100_000)

describe("staking on a shared account with a hidden reward", () => {
  let lucia: Awaited<ReturnType<typeof household>>[number]
  let pablo: typeof lucia
  let accountId: string

  beforeAll(async () => {
    await migrate()
    ;[lucia, pablo] = (await household("home", ["lucia", "pablo"])) as [typeof lucia, typeof lucia]
    const account = await addAccount({ householdId: "home", ownerId: "lucia", name: "Staking wallet", kind: "crypto", visibility: "household" })
    accountId = account.id
    await db.insert(stakingPosition).values({
      accountId,
      chain: "nimiq",
      symbol: "NIM",
      decimals: 5,
      validator: "NQ00 VALIDATOR",
      validatorListed: true,
      liquid: "0",
      active: coins(1000),
      inactive: "0",
      retired: "0",
      observedAt: "2026-10-20T00:00:00.000Z",
      coverageFrom: "2026-01-01T00:00:00.000Z",
      coverageTo: "2026-10-20T00:00:00.000Z",
    })
    const event = (id: string, at: string, kind: (typeof stakingEvent.$inferInsert)["kind"], amount: number, counterparty: string) => ({
      accountId,
      id,
      at,
      kind,
      atoms: coins(amount),
      counterparty,
      evidence: "Synthetic",
    })
    await db.insert(stakingEvent).values([
      event("deposit-hash:value", "2026-02-01T10:00:00.000Z", "deposit", 1000, "NQ00 STAKING"),
      event("deposit-hash:fee", "2026-02-01T10:00:00.000Z", "fee", 1, "NQ00 STAKING"),
      event("hidden-hash:value", "2026-08-15T10:00:00.000Z", "reward_paid", 70, "NQ00 SECRET PAYER"),
      event("shown-hash:value", "2026-09-15T10:00:00.000Z", "reward_paid", 20, "NQ00 VALIDATOR"),
      event("restake:digest", "2026-09-30T00:00:00.000Z", "reward_restaked", 5, "NQ00 VALIDATOR"),
    ])
    // The rewards paid became wallet transactions, keyed by their hash; Lucía hid one.
    await addTransaction(account, { externalId: "hidden-hash", date: "2026-08-15", amountMinor: 7000, description: "Received 70 NIM in rewards", hidden: true })
    await addTransaction(account, { externalId: "shown-hash", date: "2026-09-15", amountMinor: 2000, description: "Received 20 NIM in rewards" })
  })

  it("leaves the hidden reward out of the partner's account page", async () => {
    const staking = (await accountDetail(pablo, accountId))!.staking!
    expect(staking.events.map((event) => event.id)).not.toContain("hidden-hash:value")
    expect(staking.events.map((event) => event.id)).toEqual(expect.arrayContaining(["deposit-hash:value", "deposit-hash:fee", "shown-hash:value", "restake:digest"]))
    expect(staking.eventCount).toBe(4)
    expect(staking.amounts.rewardsPaid).toBe("20")
    expect(staking.amounts.rewards).toBe("25")
    expect(staking.values?.rewards).toBe(2500)
    expect(staking.monthly.map((month) => month.month)).toEqual(["2026-09"])
    expect(staking.senders.map((sender) => sender.address)).toEqual(["NQ00 VALIDATOR"])
    // What's staked is the balance, which the bank-like holding reports with every coin.
    expect(staking.amounts.staked).toBe("1000")
  })

  it("leaves the hidden reward out of the partner's overview", async () => {
    const [row] = (await overview(pablo, "household")).staking
    expect(row).toMatchObject({ accountId, rewards: "25", staked: "1000" })
  })

  it("still counts it for the owner", async () => {
    const staking = (await accountDetail(lucia, accountId))!.staking!
    expect(staking.events.map((event) => event.id)).toContain("hidden-hash:value")
    expect(staking.amounts.rewards).toBe("95")
    expect(staking.monthly.map((month) => month.month)).toEqual(["2026-08", "2026-09"])
    const [row] = (await overview(lucia, "household")).staking
    expect(row).toMatchObject({ rewards: "95" })
  })
})
