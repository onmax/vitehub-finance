import { describe, expect, it } from "vitest"
import { compactNimiq, CryptoError, formatUnits, NIMIQ_STAKING_CONTRACT, nimiq, nimiqStaking, nimiqTime, parseNimiqAddress, StakingConflict, summarizeStaking } from "../src/index.ts"
import type { StakingEvent, StakingLedger } from "../src/index.ts"

/** A made-up Nimiq address with a valid check: 32 base32 characters, then the IBAN-style digits. */
function nq(body: string) {
  let rest = 0
  for (const char of `${body}NQ00`) for (const digit of /\d/.test(char) ? char : String(char.charCodeAt(0) - 55)) rest = (rest * 10 + Number(digit)) % 97
  return parseNimiqAddress(`NQ${String(98 - rest).padStart(2, "0")}${body}`)!
}

const ADDRESS = nq("TEST0000000000000000000000000001")
const POOL = nq("P00L0000000000000000000000000002")
const REWARDS = nq("PAY00000000000000000000000000003")
const STRANGER = nq("ANY00000000000000000000000000004")
const START = "2025-01-01T00:00:00.000Z"
const END = "2025-02-01T00:00:00.000Z"

const event = (id: string, kind: StakingEvent["kind"], atoms: bigint, at = START): StakingEvent => ({ id, at, kind, atoms, counterparty: POOL, evidence: "test" })

const ledger = (...events: StakingEvent[]): StakingLedger => ({
  asset: { chain: "nimiq", symbol: "NIM", decimals: 5 },
  address: ADDRESS,
  from: START,
  to: END,
  position: { liquid: 10_000n, active: 3_200_000_000_000n, inactive: 100_000n, retired: 200_000n, validator: POOL, observedAt: END },
  events,
  validatorListed: true,
  notes: [],
})

describe("staking accounting", () => {
  it("never counts principal or restaked rewards as more money", () => {
    const { totals, unknown } = summarizeStaking(
      ledger(
        event("deposit", "deposit", 900_000_000n),
        event("withdraw", "withdrawal", 800_000_000n),
        event("paid", "reward_paid", 123_456n),
        event("restake", "reward_restaked", 23_456n),
        event("other", "unclassified", 500_000_000n),
      ),
    )
    expect(formatUnits(totals.rewards, 5)).toBe("1.46912")
    expect(formatUnits(totals.staked, 5)).toBe("32000003")
    // Holdings are the balances only: rewards, deposits, and unclassified receipts are history inside them.
    expect(formatUnits(totals.holdings, 5)).toBe("32000003.1")
    expect(formatUnits(totals.netStakingTransfers, 5)).toBe("1000")
    expect(formatUnits(totals.unclassified, 5)).toBe("5000")
    expect(unknown).toEqual({ unpaidRewards: null, profit: null, apy: null })
  })

  it("counts the same event read twice once, and refuses two events with one id", () => {
    const reward = event("same", "reward_paid", 1n)
    expect(summarizeStaking(ledger(reward, { ...reward })).totals.rewards).toBe(1n)
    expect(() => summarizeStaking(ledger(reward, event("same", "reward_paid", 2n)))).toThrow(StakingConflict)
  })

  it("covers [from, to) and adds rewards up by month", () => {
    const summary = summarizeStaking(
      ledger(event("included", "reward_paid", 1n), event("restaked", "reward_restaked", 5n, "2025-01-31T23:59:59.999Z"), event("excluded", "reward_paid", 100n, END)),
    )
    expect(summary.monthly).toEqual([{ month: "2025-01", paid: 1n, restaked: 5n }])
    expect(summary.events.map((row) => row.id)).toEqual(["included", "restaked"])
    expect(summary.senders).toEqual([{ address: POOL, atoms: 6n }])
  })

  it("refuses a negative amount", () => {
    expect(() => summarizeStaking(ledger(event("bad", "reward_paid", -1n)))).toThrow(RangeError)
  })

  it("writes base units as exact decimals", () => {
    expect(formatUnits(3_200_000_012_345n, 5)).toBe("32000000.12345")
    expect(formatUnits(1n, 18)).toBe("0.000000000000000001")
    expect(formatUnits(-150n, 2)).toBe("-1.5")
    expect(formatUnits(0n, 5)).toBe("0")
  })
})

describe("Nimiq staking", () => {
  const ms = Date.parse(START)
  const tx = (overrides: Record<string, unknown> = {}) => ({
    hash: "tx",
    from: POOL,
    to: ADDRESS,
    value: 100_000,
    fee: 0,
    blockNumber: 20_000_000,
    timestamp: ms,
    executionResult: true,
    ...overrides,
  })

  /** NimiqWatch, its restake index, and the validators directory, answering from what a test gives. */
  function network(input: { transactions?: unknown[][]; groups?: unknown[]; staker?: unknown; stakerError?: string; listed?: string[]; window?: { from: string; to: string } }) {
    const calls: string[] = []
    let page = 0
    const stub = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const href = String(url)
      if (href.includes("restake-grouped")) {
        const query = new URL(href).searchParams
        return Response.json({ from: input.window?.from ?? query.get("from"), to: input.window?.to ?? query.get("to"), groups: input.groups ?? [] })
      }
      if (href.includes("validators")) return Response.json((input.listed ?? [POOL]).map((address) => ({ address })))
      const { method } = JSON.parse(String(init!.body))
      calls.push(method)
      const data: Record<string, unknown> = {
        getAccountByAddress: { balance: 19_458_966_097 },
        getStakerByAddress: input.staker === undefined ? { balance: 3_200_000_000_000, inactiveBalance: 0, retiredBalance: 0, delegation: POOL } : input.staker,
        getValidatorByAddress: { rewardAddress: REWARDS },
      }
      if (method === "getTransactionsByAddress") data[method] = input.transactions?.[Math.min(page++, input.transactions.length - 1)] ?? []
      if (method === "getStakerByAddress" && input.stakerError) return Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32603, message: "error", data: input.stakerError } })
      return Response.json({ jsonrpc: "2.0", id: 1, result: { data: data[method] } })
    }) as typeof fetch
    const request = (url: string, init?: RequestInit) => stub(url, init)
    return { request, calls }
  }

  const read = (net: ReturnType<typeof network>) => nimiqStaking(ADDRESS, { request: net.request, now: new Date(END) })

  it("checks addresses and knows the staking contract", () => {
    expect(parseNimiqAddress(NIMIQ_STAKING_CONTRACT)).toBe("NQ77 0000 0000 0000 0000 0000 0000 0000 0001")
    expect(parseNimiqAddress(`${compactNimiq(ADDRESS).slice(0, -1)}0`)).toBeNull()
  })

  it("reads balances by state and keeps unknown senders out of rewards", async () => {
    const ledger = await read(network({ transactions: [[tx({ hash: "known" }), tx({ hash: "payout", from: REWARDS }), tx({ hash: "stranger", from: STRANGER }), tx({ hash: "failed", executionResult: false })]] }))
    expect(ledger.position).toMatchObject({ liquid: 19_458_966_097n, active: 3_200_000_000_000n, inactive: 0n, retired: 0n, validator: POOL })
    expect(ledger.events.map((row) => [row.id, row.kind])).toEqual([
      ["known:value", "reward_paid"],
      ["payout:value", "reward_paid"],
      ["stranger:value", "unclassified"],
    ])
    expect(ledger.validatorListed).toBe(true)
  })

  it("counts a failed staking transaction's fee, and a withdrawal isn't a reward", async () => {
    const ledger = await read(
      network({
        transactions: [[tx({ hash: "f", from: ADDRESS, to: NIMIQ_STAKING_CONTRACT, fee: 10, executionResult: false }), tx({ hash: "w", from: NIMIQ_STAKING_CONTRACT, fee: 2 })]],
      }),
    )
    expect(ledger.events.map((row) => [row.id, row.kind, row.atoms])).toEqual([
      ["f:fee", "fee", 10n],
      ["w:fee", "fee", 2n],
      ["w:value", "withdrawal", 100_000n],
    ])
  })

  it("reads the old chain's seconds and proof-of-stake milliseconds as the same moment", () => {
    expect(nimiqTime({ blockNumber: 1, timestamp: ms / 1000 })).toBe(nimiqTime({ blockNumber: 20_000_000, timestamp: ms }))
  })

  it("counts a grouped restake as a reward only from a known validator", async () => {
    const group = { sender_address: compactNimiq(POOL), time_window: "2025-01-02T07:15:00Z", aggregated_value: 123 }
    const known = await read(network({ groups: [group] }))
    expect(known.events.map((row) => [row.kind, row.atoms])).toEqual([["reward_restaked", 123n]])
    const unknown = await read(network({ groups: [group], listed: [], staker: null, stakerError: "No staker with address: x" }))
    expect(unknown.events[0]!.kind).toBe("unclassified")
    expect(unknown.validatorListed).toBeNull()
  })

  it("says so when the validator isn't in the public directory", async () => {
    const ledger = await read(network({ listed: [] }))
    expect(ledger.validatorListed).toBe(false)
    expect(ledger.notes.join(" ")).toMatch(/unpaid rewards and payout schedule are unknown/)
  })

  it("pages through overlapping cursors without counting a payment twice", async () => {
    const page = Array.from({ length: 100 }, (_, index) => tx({ hash: String(index) }))
    const ledger = await read(network({ transactions: [page, [page.at(-1), tx({ hash: "100" })]] }))
    expect(ledger.events).toHaveLength(101)
    expect(new Set(ledger.events.map((row) => row.id)).size).toBe(101)
  })

  it("fails instead of returning part of the history when the cursor stalls", async () => {
    const page = Array.from({ length: 100 }, (_, index) => tx({ hash: String(index) }))
    await expect(read(network({ transactions: [page, page] }))).rejects.toThrow(/incomplete/)
  })

  it("fails when the restake index covers only part of the interval", async () => {
    await expect(read(network({ window: { from: START, to: "2025-01-15T00:00:00.000Z" } }))).rejects.toThrow(/only part/)
  })

  it("treats only 'No staker with address' as not staking; other errors fail the read", async () => {
    const none = await read(network({ staker: null, stakerError: "No staker with address: x" }))
    expect(none.position).toMatchObject({ active: 0n, validator: null })
    await expect(read(network({ stakerError: "database unavailable" }))).rejects.toBeInstanceOf(CryptoError)
    const failing = network({ stakerError: "database unavailable" })
    await expect(nimiq(ADDRESS, { fetch: ((url: RequestInfo | URL, init?: RequestInit) => failing.request(String(url), init)) as typeof fetch }).balances()).rejects.toBeInstanceOf(CryptoError)
  })
})
