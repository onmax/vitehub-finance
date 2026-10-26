import { describe, expect, it } from "vitest"
import { mapTransactions, type EbTransaction } from "@vitehub-finance/banking/enable-banking"
import { categorize, decimalToMinor, dedupeKeys, isDate } from "../../server/providers/dedupe"

describe("parsing and rules", () => {
  it("turns decimal strings and numbers into minor units", () => {
    expect(decimalToMinor("12.30", "EUR")).toBe(1230)
    expect(decimalToMinor("-0.5", "EUR")).toBe(-50)
    expect(decimalToMinor("1234", "EUR")).toBe(123400)
    expect(decimalToMinor("0.125", "EUR")).toBe(13)
    expect(decimalToMinor("1500", "JPY")).toBe(1500)
    expect(decimalToMinor(-12.3, "EUR")).toBe(-1230)
    expect(decimalToMinor(0.1 + 0.2, "EUR")).toBe(30)
    expect(decimalToMinor("abc", "EUR")).toBeNull()
    expect(decimalToMinor("", "EUR")).toBeNull()
  })

  it("accepts real calendar days only", () => {
    expect(isDate("2026-02-28")).toBe(true)
    expect(isDate("2026-02-30")).toBe(false)
    expect(isDate("26-02-01")).toBe(false)
  })

  it("dedupes CSV rows like bank rows", async () => {
    const rows = [
      { date: "2026-10-01", amountMinor: -350, description: "Coffee" },
      { date: "2026-10-01", amountMinor: -350, description: "coffee " },
      { date: "2026-10-01", amountMinor: -350, description: "Coffee", externalId: "abc" },
    ]
    const keys = await dedupeKeys(rows)
    expect(keys[0]).not.toBe(keys[1])
    expect(keys[2]).toBe("id:abc")
    expect(await dedupeKeys(rows)).toEqual(keys)
  })

  it("categorizes by the longest matching rule, case-insensitively", () => {
    const rules = [
      { match: "amazon", categoryId: "shopping" },
      { match: "amazon prime", categoryId: "subscriptions" },
      { match: "mercadona", categoryId: "groceries" },
    ]
    expect(categorize(rules, { description: "AMAZON PRIME *2X4", counterparty: null })).toBe("subscriptions")
    expect(categorize(rules, { description: "Amazon.es order", counterparty: null })).toBe("shopping")
    expect(categorize(rules, { description: "Card payment", counterparty: "Mercadona SA" })).toBe("groceries")
    expect(categorize(rules, { description: "Rent" })).toBeNull()
  })
})

const row = (overrides: Partial<EbTransaction>): EbTransaction => ({
  transaction_amount: { amount: "12.30", currency: "EUR" },
  credit_debit_indicator: "DBIT",
  booking_date: "2026-10-20",
  remittance_information: ["CARD PAYMENT", "MERCADONA VALENCIA"],
  creditor: { name: "Mercadona" },
  debtor: { name: "Maxi" },
  ...overrides,
})

describe("bank rows' dedupe keys", () => {
  it("prefers the bank's id", async () => {
    const keys = await dedupeKeys(mapTransactions([row({ transaction_id: "T-1", entry_reference: "E-1" }), row({ entry_reference: "E-2" })]))
    expect(keys).toEqual(["id:T-1", "id:E-2"])
  })

  it("stays stable across fetches and tells identical same-day rows apart", async () => {
    const fetch = [row({}), row({}), row({ booking_date: "2026-10-21" })]
    const first = await dedupeKeys(mapTransactions(fetch))
    expect(await dedupeKeys(mapTransactions(structuredClone(fetch)))).toEqual(first)
    expect(first[0]).not.toBe(first[1])
    expect(first.every((key) => key.startsWith("h:"))).toBe(true)
    // Whitespace and case in the description don't make a new transaction.
    const [noisy] = await dedupeKeys(mapTransactions([row({ remittance_information: ["card  payment", "Mercadona valencia "] })]))
    expect(noisy).toBe(first[0])
  })
})
