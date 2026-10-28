import { describe, expect, it } from "vitest"
import { sessionAccounts } from "@vitehub-finance/banking/enable-banking"
import { looksLikeTransfer, pairTransfers, type TransferCandidate } from "../../server/utils/transfers-core"

// Rough ECB rates into EUR, as minor units per minor unit.
const RATES: Record<string, number> = { EUR: 1, SEK: 1 / 11.1, DKK: 1 / 7.46 }
const toBase = (minor: number, currency: string) => Math.round(minor * RATES[currency]!)

let next = 0
const row = (accountId: string, date: string, amountMinor: number, currency: string, description: string, extra: Partial<TransferCandidate> = {}) => ({
  id: `t${++next}`,
  accountId,
  ownerId: "maxi",
  private: false,
  date,
  amountMinor,
  currency,
  description,
  counterparty: null,
  ...extra,
})

describe("transfer pairs", () => {
  it("pairs a provider-marked Stripe payout with its bank deposit without classifying customer receipts as transfers", () => {
    const payout = row("stripe", "2026-10-01", -9700, "EUR", "Stripe payout", { transfer: true })
    const bank = row("bank", "2026-10-03", 9700, "EUR", "STRIPE")
    const charge = row("stripe", "2026-10-01", 9700, "EUR", "Stripe charge")
    expect(pairTransfers([payout, bank, charge], toBase)).toEqual([{ out: payout, in: bank }])
    expect(looksLikeTransfer(charge)).toBe(false)
  })
  it("pairs a card top-up from another bank with the inflow it became, across currencies", () => {
    const lunar = row("lunar-dkk", "2026-10-08", -2_688_131, "DKK", "Revolut", { counterparty: "Revolut**9014*" })
    const topUp = row("revolut-sek", "2026-10-07", 4_000_000, "SEK", "Top-Up by *4821")
    const coffee = row("revolut-sek", "2026-10-07", -4_500, "SEK", "Espresso House")
    const pairs = pairTransfers([lunar, topUp, coffee], toBase)
    expect(pairs.map((pair) => [pair.out.id, pair.in.id])).toEqual([[lunar.id, topUp.id]])
  })

  it("pairs currency exchanges between pockets of one bank", () => {
    const sekOut = row("revolut-sek", "2026-10-12", -6_000_000, "SEK", "Exchanged to EUR")
    const eurIn = row("revolut-eur", "2026-10-12", 533_931, "EUR", "Exchanged to EUR")
    expect(pairTransfers([sekOut, eurIn], toBase)).toHaveLength(1)
  })

  it("pairs equal amounts in one currency a few days apart, and nothing further", () => {
    const out = row("lunar-dkk", "2026-10-14", -800_000, "DKK", "Revolut")
    const near = row("revolut-dkk", "2026-10-13", 800_000, "DKK", "Top-Up by *4821")
    const far = row("revolut-dkk", "2026-10-01", 800_000, "DKK", "Top-Up by *4821")
    expect(pairTransfers([out, far, near], toBase)[0]!.in.id).toBe(near.id)
    expect(pairTransfers([out, far], toBase)).toEqual([])
  })

  it("leaves two unrelated payments of about the same amount apart", () => {
    const subscription = row("revolut-sek", "2026-10-03", -199_600, "SEK", "Openai *chatgpt Subscr")
    const payout = row("revolut-eur", "2026-09-30", 18_000, "EUR", "Auszahlg.Probandengeld 404/15")
    expect(pairTransfers([subscription, payout], toBase)).toEqual([])
  })

  it("pairs a transfer to yourself at another bank", () => {
    const out = row("lunar-dkk", "2026-04-01", -3_133_000, "DKK", "Alex Moreno Ruiz", { ownerName: "Álex Moreno Ruíz" })
    const inflow = row("revolut-sek", "2026-04-01", 4_543_360, "SEK", "Payment from Alex Javier Moreno Ruiz", { ownerName: "Álex Moreno Ruíz" })
    expect(pairTransfers([out, inflow], toBase)).toHaveLength(1)
  })

  it("never pairs a refund on the same account, or amounts that differ", () => {
    const charge = row("revolut-sek", "2026-10-16", -307_460, "SEK", "Google Play Apps")
    const refund = row("revolut-sek", "2026-10-19", 307_460, "SEK", "Refund from Google Play Apps")
    const other = row("lunar-dkk", "2026-10-16", 300_000, "DKK", "MobilePay")
    expect(pairTransfers([charge, refund, other], toBase)).toEqual([])
  })

  it("keeps a private account out of pairs with someone else's account", () => {
    const mine = row("maxi-private", "2026-10-02", -50_000, "EUR", "To pocket", { private: true })
    const theirs = row("partner-shared", "2026-10-02", 50_000, "EUR", "From pocket", { ownerId: "partner" })
    expect(pairTransfers([mine, theirs], toBase)).toEqual([])
    expect(pairTransfers([{ ...mine, private: false }, theirs], toBase)).toHaveLength(1)
  })
})

describe("rows that say they are transfers", () => {
  it.each([
    ["Exchanged to SEK", null],
    ["Top-Up by *4821", null],
    ["OBK100000001 To IBKR", "IBKR"],
    ["To pocket", null],
    ["TRASPASO A CUENTA PROPIA", null],
    ["LIQUIDACION TARJETA CREDITO 3307", "BBVA Tarjeta"],
  ])("%s", (description, counterparty) => {
    expect(looksLikeTransfer({ description, counterparty })).toBe(true)
  })

  it.each(["Openai *chatgpt Subscr", "Revpoints Spare Change", "To Clara Isabel Moreno Ruiz", "20000000000000 To Example Property Rentals"])(
    "not %s",
    (description) => {
      expect(looksLikeTransfer({ description, counterparty: null, ownerName: "Álex Moreno Ruíz" })).toBe(false)
    },
  )

  it("not a refund that names you", () => {
    const refund = { description: "Refund from Google Play Apps", counterparty: "ALEX JAVIER MORENO RUIZ", ownerName: "Álex Moreno Ruíz" }
    expect(looksLikeTransfer(refund)).toBe(false)
  })
})

describe("bank account names", () => {
  it("names accounts by bank and currency, not by the holder", () => {
    const accounts = sessionAccounts(
      [
        { uid: "a", name: "Álex Moreno Ruíz", currency: "SEK", account_id: { iban: "LT121000011101001000" } },
        { uid: "b", name: "Álex Moreno Ruíz", currency: "EUR", account_id: { iban: "LT121000011101001000" } },
      ],
      "Revolut",
    )
    expect(accounts.map((account) => account.name)).toEqual(["Revolut SEK", "Revolut EUR"])
  })

  it("adds the IBAN's last digits when two accounts would share a name", () => {
    const accounts = sessionAccounts(
      [
        { uid: "a", name: "Ana", currency: "EUR", account_id: { iban: "ES0000000000000000001234" } },
        { uid: "b", name: "Ana", currency: "EUR", account_id: { iban: "ES0000000000000000005678" } },
      ],
      "BBVA",
    )
    expect(accounts.map((account) => account.name)).toEqual(["BBVA EUR ···1234", "BBVA EUR ···5678"])
  })
})
