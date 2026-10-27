import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { xrpl } from "@vitehub-finance/crypto"
import { coinTransaction, holdingChange } from "../../server/providers/crypto"
import { quantityTimeline, valueTimeline } from "../../server/utils/holdings-history"

const address = "rRedactedXrpAddress01xxxxxxxxxxx"
const fixture = (name: string) =>
  readFileSync(new URL(`../../packages/crypto/test/fixtures/xrpl-redacted-${name}.json`, import.meta.url), "utf8")

/** The real wallet's history, read through the crypto package from the recorded `account_tx`. */
async function realHistory() {
  const body = fixture("account_tx")
  const stub = (async () => new Response(body)) as typeof fetch
  return xrpl(address, { fetch: stub }).transactions!()
}

const at = (timeline: Array<{ date: string; quantities: Record<string, number> }>, date: string) =>
  timeline.find((day) => day.date === date)?.quantities.XRP

describe("a wallet's balance history", () => {
  it("walks back from today's holding to nothing before the wallet's first payment", async () => {
    const transactions = await realHistory()
    const changes = transactions.map((row) => ({ date: row.date, symbol: row.symbol, quantity: holdingChange(row) }))
    const timeline = quantityTimeline([{ symbol: "XRP", quantity: 0 }], { since: null, changes }, "2026-10-27", "2025-10-27")
    expect(timeline[0]!.date).toBe("2026-07-31")
    expect(timeline.at(-1)!.date).toBe("2026-10-26")
    expect(timeline).toHaveLength(88)
    expect(at(timeline, "2026-07-31")).toBeCloseTo(0, 9)
    // Funded on 1 August with 47,362.18372 XRP (and 6 drops of spam), then 3 drops more by 26 August.
    expect(at(timeline, "2026-08-01")).toBeCloseTo(47362.18372, 9)
    expect(at(timeline, "2026-08-22")).toBeCloseTo(47362.18372, 9)
    expect(at(timeline, "2026-08-23")).toBeCloseTo(47362.183721, 9)
    expect(at(timeline, "2026-08-26")).toBeCloseTo(0, 9)
    expect(at(timeline, "2026-10-26")).toBeCloseTo(0, 9)
  })

  it("values each day at its own price and leaves out days it can't price", () => {
    const timeline = [
      { date: "2026-07-31", quantities: { XRP: 0 } },
      { date: "2026-08-01", quantities: { XRP: 1000 } },
      { date: "2026-08-02", quantities: { XRP: 1000 } },
      { date: "2026-08-03", quantities: { XRP: 990 } },
    ]
    const prices: Record<string, number> = { "2026-08-01": 2.5, "2026-08-03": 2.123456 }
    // No price at all on 31 July, but holding nothing is worth nothing.
    expect(valueTimeline(timeline, (_symbol, date) => prices[date] ?? null, 2)).toEqual([
      { date: "2026-07-31", valueMinor: 0 },
      { date: "2026-08-01", valueMinor: 250_000 },
      { date: "2026-08-03", valueMinor: 210_222 },
    ])
  })

  it("counts fees and staking the way the holding does", () => {
    const base = { id: "H", date: "2026-10-20", symbol: "NIM", counterparty: null }
    expect(holdingChange({ ...base, quantity: -10, fee: 0.001, kind: "send" })).toBeCloseTo(-10.001, 9)
    expect(holdingChange({ ...base, quantity: -500, fee: 0.001, kind: "stake" })).toBe(-0.001)
    expect(holdingChange({ ...base, quantity: 0, fee: 0.000015, kind: "fee" })).toBe(-0.000015)
    expect(holdingChange({ ...base, quantity: 3.2, fee: 0, kind: "reward" })).toBe(3.2)
  })

  it("covers only the days a partial read covers in full, and nothing past the price horizon", () => {
    const changes = [
      { date: "2026-10-25", symbol: "XRP", quantity: 5 },
      { date: "2026-10-20", symbol: "XRP", quantity: -2 },
    ]
    // The last ten days: every day from `since`, even before the first change.
    const recent = quantityTimeline([{ symbol: "XRP", quantity: 100 }], { since: "2026-10-17", changes }, "2026-10-27", "2025-10-27")
    expect(recent.map((day) => [day.date, day.quantities.XRP])).toEqual([
      ["2026-10-17", 97],
      ["2026-10-18", 97],
      ["2026-10-19", 97],
      ["2026-10-20", 95],
      ["2026-10-21", 95],
      ["2026-10-22", 95],
      ["2026-10-23", 95],
      ["2026-10-24", 95],
      ["2026-10-25", 100],
      ["2026-10-26", 100],
    ])
    // A whole history cut short by page caps starts at what was left before the oldest change it read.
    const capped = quantityTimeline([{ symbol: "XRP", quantity: 100 }], { since: null, changes }, "2026-10-27", "2025-10-27")
    expect(capped[0]).toEqual({ date: "2026-10-19", quantities: { XRP: 97 } })
    expect(quantityTimeline([{ symbol: "XRP", quantity: 100 }], { since: null, changes }, "2026-10-27", "2026-10-24")[0]!.date).toBe("2026-10-24")
    expect(quantityTimeline([{ symbol: "XRP", quantity: 100 }], { since: null, changes: [] }, "2026-10-27", "2025-10-27")).toEqual([])
  })

  it("keeps the wallet's rows to the payments worth a cent, as transfers", async () => {
    const rows = (await realHistory()).map(coinTransaction).filter((row) => row !== null)
    expect(rows.map((row) => row.description)).toEqual([
      "Received 0.000001 XRP",
      "Received 0.000001 XRP",
      "Received 0.000001 XRP",
      "Received 0.000002 XRP",
      "Received 3,559.800466 XRP",
      "Received 0.000002 XRP",
      "Received 43,788.683248 XRP",
      "Received 0.000002 XRP",
      "Received 13.7 XRP",
    ])
    expect(rows.every((row) => row.transfer)).toBe(true)
    // Valued at €1.16 the dust rounds to €0.00 and valueCoinTransactions drops it, leaving the three real payments.
    expect(rows.filter((row) => Math.round(row.quantity * 1.16 * 100) !== 0).map((row) => row.quantity)).toEqual([3559.800466, 43788.683248, 13.7])
  })
})
