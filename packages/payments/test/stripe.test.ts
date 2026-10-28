import { describe, expect, it } from "vitest"
import { isStripeTransfer, stripe } from "../src/index.ts"

const key = "rk_live_synthetic"
const balance = { livemode: true, available: [{ currency: "eur", amount: 9700 }], pending: [] }
const row = (overrides = {}) => ({
  id: "txn_sale", amount: 10000, fee: 300, net: 9700, currency: "eur", created: 1790812800,
  available_on: 1790985600, status: "available", type: "charge", reporting_category: "charge", source: "ch_sale", ...overrides,
})

function api(respond: (url: URL) => unknown | Response) {
  const calls: Array<{ url: URL; init?: RequestInit }> = []
  const send: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    calls.push({ url, init })
    const result = respond(url)
    return result instanceof Response ? result : Response.json(result)
  }
  return { send, calls }
}

describe("Stripe read-only ledger", () => {
  it("checks merchant identity, live mode and ledger permission using GET only", async () => {
    const { send, calls } = api((url) => url.pathname.endsWith("/account") ? { id: "acct_merchant", email: "private@example.test" }
      : url.pathname.endsWith("/balance") ? balance : { data: [], has_more: false })
    expect(await stripe({ key }, { fetch: send }).verify()).toEqual({ accountId: "acct_merchant" })
    expect(calls.map((call) => call.url.pathname)).toEqual(["/v1/account", "/v1/balance", "/v1/balance_transactions"])
    expect(calls.every((call) => call.init?.method === "GET")).toBe(true)
    expect(calls.every((call) => new Headers(call.init?.headers).get("authorization") === `Bearer ${key}`)).toBe(true)
    expect(calls.every((call) => !call.url.searchParams.has("expand"))).toBe(true)
  })

  it("paginates stable IDs, preserves settlement currency and net fees, and removes customer data", async () => {
    const { send, calls } = api((url) => {
      if (url.pathname.endsWith("/balance")) return { ...balance, pending: [{ currency: "jpy", amount: 1500 }] }
      if (url.searchParams.has("starting_after")) return { data: [row({ id: "txn_refund", amount: -2000, fee: 0, net: -2000, type: "refund", reporting_category: "refund" })], has_more: false }
      return { data: [row({ description: "Customer private name", customer: { email: "private@example.test" }, exchange_rate: 1.2 })], has_more: true }
    })
    const result = await stripe({ key }, { fetch: send }).read({ since: "2026-10-01" })
    expect(result.movements.map((movement) => [movement.id, movement.grossMinor, movement.feeMinor, movement.netMinor])).toEqual([
      ["txn_sale", 10000, 300, 9700], ["txn_refund", -2000, 0, -2000],
    ])
    expect(result.balances).toEqual([
      { currency: "EUR", availableMinor: 9700, pendingMinor: 0 }, { currency: "JPY", availableMinor: 0, pendingMinor: 1500 },
    ])
    expect(calls[1]!.url.searchParams.get("starting_after")).toBe("txn_sale")
    expect(calls[0]!.url.searchParams.get("created[gte]")).toBe(String(Date.parse("2026-10-01") / 1000))
    expect(calls[0]!.url.searchParams.get("created[lte]")).toBe(calls[1]!.url.searchParams.get("created[lte]"))
    expect(JSON.stringify(result)).not.toMatch(/private|Customer/)
  })

  it("refreshes old pending IDs outside the recent creation window without adding a second row", async () => {
    const { send, calls } = api((url) => url.pathname.endsWith("/balance") ? balance
      : url.pathname.endsWith("/txn_sale") ? row() : { data: [row({ id: "txn_new" })], has_more: false })
    const result = await stripe({ key }, { fetch: send }).read({ since: "2026-10-20", pendingIds: ["txn_sale", "txn_sale", "txn_new"] })
    expect(result.movements.map((movement) => movement.id)).toEqual(["txn_new", "txn_sale"])
    expect(calls.filter((call) => call.url.pathname.endsWith("/txn_sale"))).toHaveLength(1)
    expect(result.movements[1]!.status).toBe("available")
  })

  it("keeps non-Payments ledger entries out of Payments balances", async () => {
    const { send } = api((url) => url.pathname.endsWith("/balance") ? balance : {
      data: [row(), row({ id: "txn_reserve", balance_type: "risk_reserved", type: "reserve_hold" })], has_more: false,
    })
    expect((await stripe({ key }, { fetch: send }).read({ since: null })).movements).toHaveLength(1)
  })

  it.each(["sk_live_synthetic", "pk_live_synthetic", "rk_test_synthetic", ""])("rejects %s before making requests", (invalid) => {
    expect(() => stripe({ key: invalid })).toThrow(/live restricted/)
  })

  it("rejects a test-mode balance even with a live-shaped key", async () => {
    const { send } = api((url) => url.pathname.endsWith("/account") ? { id: "acct_test" } : { ...balance, livemode: false })
    await expect(stripe({ key }, { fetch: send }).verify()).rejects.toMatchObject({ code: "live_required" })
  })

  it.each([[401, "invalid_credentials"], [403, "permissions"], [429, "rate_limited"], [500, "unavailable"]])(
    "sanitizes Stripe HTTP %s without repeating its response body", async (status, code) => {
      const { send } = api(() => new Response("SECRET_CUSTOMER SECRET_KEY", { status: Number(status) }))
      const result = stripe({ key }, { fetch: send }).verify()
      await expect(result).rejects.toMatchObject({ code })
      await expect(result).rejects.not.toThrow(/SECRET/)
    },
  )

  it("fails malformed or inconsistent money instead of dropping an accounting row", async () => {
    const { send } = api(() => ({ data: [row({ net: 9999 })], has_more: false }))
    await expect(stripe({ key }, { fetch: send }).read({ since: null })).rejects.toMatchObject({ code: "unavailable" })
  })

  it("normalizes Stripe's ISK and UGX hundredths to ISO minor units without rounding", async () => {
    const { send } = api((url) => url.pathname.endsWith("/balance")
      ? { livemode: true, available: [{ currency: "isk", amount: 9700 }], pending: [] }
      : { data: [row({ currency: "isk" }), row({ id: "txn_ugx", currency: "ugx" })], has_more: false })
    const result = await stripe({ key }, { fetch: send }).read({ since: null })
    expect(result.movements.map((movement) => [movement.grossMinor, movement.feeMinor, movement.netMinor])).toEqual([[100, 3, 97], [100, 3, 97]])
    expect(result.balances[0]!.availableMinor).toBe(97)
    const invalid = api(() => ({ data: [row({ currency: "isk", fee: 301, net: 9699 })], has_more: false }))
    await expect(stripe({ key }, { fetch: invalid.send }).read({ since: null })).rejects.toMatchObject({ code: "unavailable" })
  })

  it("treats payouts, own funding, reserves and FX as transfers but keeps merchant transfers reviewable", () => {
    for (const type of ["payout", "payout_failure", "payout_cancel", "topup", "topup_reversal", "reserved_funds", "currency_conversion", "advance"])
      expect(isStripeTransfer({ type, reportingCategory: type }), type).toBe(true)
    for (const type of ["charge", "refund", "stripe_fee", "transfer", "transfer_refund", "stripe_balance_payment_debit"])
      expect(isStripeTransfer({ type, reportingCategory: type }), type).toBe(false)
  })
})
