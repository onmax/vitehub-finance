import { describe, expect, it } from "vitest"
import { mapTransactions, type EbTransaction } from "@vitehub-finance/banking/enable-banking"
import { coinTransaction, shortAddress } from "../../server/providers/crypto"
import { brokerHoldings, brokerTransactions } from "../../server/providers/ibkr"
import { categorize, decimalToMinor, dedupeKeys, isDate } from "../../server/providers/dedupe"
import { sessionDigest } from "../../server/providers/enable-banking"

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

describe("wallet transactions", () => {
  const base = { id: "HASH", date: "2026-10-20", symbol: "XRP", fee: 0, counterparty: null }

  it("reads like a statement, with the fee in the amount and the hash as the id", () => {
    expect(coinTransaction({ ...base, quantity: -10, fee: 0.000012, counterparty: "rLNaPoKeeBjZe2qs6x52yVPZpZ8td4dc6w", kind: "send" })).toEqual({
      externalId: "HASH",
      date: "2026-10-20",
      symbol: "XRP",
      quantity: -10.000012,
      description: "Sent 10 XRP to rLNaPo…dc6w",
      counterparty: "rLNaPo…dc6w",
      transfer: true,
    })
    expect(coinTransaction({ ...base, quantity: 1250.5, counterparty: "rUrYCcn3UkgC2ZXDWDvWT1D8VmM2X5Yiws", kind: "receive" })).toMatchObject({
      description: "Received 1,250.5 XRP",
      counterparty: "rUrYCc…Yiws",
      transfer: true,
    })
  })

  it("counts rewards as income, swaps as transfers, and leaves staking moves out", () => {
    expect(coinTransaction({ ...base, symbol: "NIM", quantity: 3.2, kind: "reward" })).toMatchObject({ description: "Received 3.2 NIM in rewards", transfer: false })
    expect(coinTransaction({ ...base, quantity: -20, kind: "trade" })).toMatchObject({ description: "Swapped 20 XRP", transfer: true })
    expect(coinTransaction({ ...base, symbol: "NIM", quantity: -500, kind: "stake" })).toBeNull()
  })

  it("calls locked and released escrow XRP transfers, and leaves fee-only transactions out", () => {
    const paid = { ...base, fee: 0.00001 }
    expect(coinTransaction({ ...paid, quantity: -50, kind: "escrow" })).toMatchObject({ description: "Locked 50 XRP in escrow", quantity: -50.00001, transfer: true })
    expect(coinTransaction({ ...paid, quantity: -50, counterparty: "rLNaPoKeeBjZe2qs6x52yVPZpZ8td4dc6w", kind: "escrow" })).toMatchObject({
      description: "Locked 50 XRP in escrow for rLNaPo…dc6w",
    })
    expect(coinTransaction({ ...paid, quantity: 50, kind: "escrow" })).toMatchObject({ description: "Released 50 XRP from escrow", transfer: true })
    expect(coinTransaction({ ...paid, quantity: 0, kind: "fee" })).toBeNull()
  })

  it("shortens addresses people can still recognize", () => {
    expect(shortAddress("NQ08 ACT8 T0FE PTG8 P5RL H2S3 QGXH V15R NVXY")).toBe("NQ08 ACT8 … NVXY")
    expect(shortAddress("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toBe("bc1qar…5mdq")
  })
})

describe("broker holdings", () => {
  const position = { description: null, assetClass: "STK", id: null, isin: null }

  it("carries IBKR's prices in their currency, cash as its currency code, and keeps a repeated symbol apart", () => {
    const holdings = brokerHoldings({
      id: "U1234567",
      positions: [
        { ...position, symbol: "VWCE", description: "VANG FTSE AW USDA", quantity: 42, markPrice: 138.56, value: 5819.52, currency: "EUR" },
        { ...position, symbol: "SHEL", quantity: 10, markPrice: 35.1, value: 351, currency: "USD" },
        { ...position, symbol: "SHEL", quantity: 20, markPrice: 27.4, value: 548, currency: "GBP" },
      ],
      cash: [{ currency: "USD", amount: -120.5 }],
      trades: [],
      cashMovements: [],
      history: [],
    })
    expect(holdings).toEqual([
      { symbol: "VWCE", name: "VANG FTSE AW USDA", quantity: 42, quote: { currency: "EUR", price: 138.56, value: 5819.52 } },
      { symbol: "SHEL", name: null, quantity: 10, quote: { currency: "USD", price: 35.1, value: 351 } },
      { symbol: "SHEL GBP", name: null, quantity: 20, quote: { currency: "GBP", price: 27.4, value: 548 } },
      { symbol: "USD", name: "Cash", quantity: -120.5, quote: { currency: "USD", price: 1, value: -120.5 } },
    ])
  })

  it("reads trades and deposits as transfers, and dividends and their tax as money in and out", () => {
    const rows = brokerTransactions({
      id: "U1234567",
      positions: [],
      cash: [],
      trades: [{ id: "741", date: "2026-10-02", symbol: "VWCE", description: "VANG FTSE AW USDA", quantity: 28, price: 167.5, netCash: -4693, currency: "EUR" }],
      cashMovements: [
        { id: "1", date: "2026-10-01", type: "Deposits/Withdrawals", description: "CASH RECEIPTS / ELECTRONIC FUND TRANSFERS", amount: 5000, currency: "EUR" },
        { id: "2", date: "2026-10-15", type: "Dividends", description: "AAPL CASH DIVIDEND", amount: 2.6, currency: "USD" },
        { id: "3", date: "2026-10-15", type: "Withholding Tax", description: "AAPL CASH DIVIDEND - US TAX", amount: -0.39, currency: "USD" },
      ],
      history: [],
    })
    expect(rows).toEqual([
      { externalId: "trade:741", date: "2026-10-02", amountMinor: -469300, currency: "EUR", description: "Buy 28 VWCE at 167.5 EUR", counterparty: "VANG FTSE AW USDA", transfer: true },
      { externalId: "cash:1", date: "2026-10-01", amountMinor: 500000, currency: "EUR", description: "CASH RECEIPTS / ELECTRONIC FUND TRANSFERS", transfer: true },
      { externalId: "cash:2", date: "2026-10-15", amountMinor: 260, currency: "USD", description: "AAPL CASH DIVIDEND", transfer: false },
      { externalId: "cash:3", date: "2026-10-15", amountMinor: -39, currency: "USD", description: "AAPL CASH DIVIDEND - US TAX", transfer: false },
    ])
  })
})

describe("bank session ids at rest", () => {
  it("keeps a one-way digest in the connection, never the id", async () => {
    const id = "8e3c2b0e-6a7f-4c1d-9f0a-2b5d7e9c1a34"
    const digest = await sessionDigest(id)
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(digest).not.toContain(id)
    expect(await sessionDigest(id)).toBe(digest)
    expect(await sessionDigest("another-session")).not.toBe(digest)
  })
})
