import { describe, expect, it } from "vitest"
import { BrokerError, morningstar, myinvestor } from "../src/index.ts"

/** Morningstar's two endpoints: the screener answers `rows`, the price series `points`. */
function morningstarStub(rows: unknown[], points: Array<[number, number | null]>) {
  const urls: URL[] = []
  const stub = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    urls.push(url)
    const body = url.pathname.includes("/screener") ? { total: rows.length, rows } : points
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
  }) as typeof fetch
  return { stub, urls }
}

const vanguard = { id: "F0GBR052TN", isin: "IE00B03HD191", name: "Vanguard Glb Stk Idx € Acc", currency: "EUR", units: 120.5 }

describe("MyInvestor through Morningstar", () => {
  it("finds funds by ISIN or name, euros first, pension plans without an ISIN", async () => {
    const { stub, urls } = morningstarStub(
      [
        { SecId: "0P0001V3NI", Name: "Vanguard FTSE All-World ETF USD Acc CHF", isin: "IE00BK5BQT80", PriceCurrency: "CHF" },
        { SecId: "F000016CB6", Name: "Myinvestor Indexado Global PP", PriceCurrency: "EUR", CategoryName: "RV Global PP" },
        { Name: "No id" },
      ],
      [],
    )
    const found = await morningstar({ fetch: stub }).search(" myinvestor indexado ")
    expect(found).toEqual([
      { id: "F000016CB6", isin: null, name: "Myinvestor Indexado Global PP", currency: "EUR", category: "RV Global PP" },
      { id: "0P0001V3NI", isin: "IE00BK5BQT80", name: "Vanguard FTSE All-World ETF USD Acc CHF", currency: "CHF", category: null },
    ])
    expect(urls[0]!.searchParams.get("term")).toBe("myinvestor indexado")
  })

  it("prices each fund at its last NAV, skipping empty days", async () => {
    const { stub, urls } = morningstarStub([], [
      [1792627200000, 64.775],
      [1792713600000, 64.468],
      [1792800000000, null],
    ])
    const [account] = await myinvestor({ funds: [vanguard] }, { fetch: stub }).accounts()
    expect(account).toEqual({
      id: "myinvestor",
      positions: [
        { symbol: "IE00B03HD191", description: vanguard.name, assetClass: "FUND", quantity: 120.5, markPrice: 64.468, value: 120.5 * 64.468, currency: "EUR", id: "F0GBR052TN", isin: "IE00B03HD191" },
      ],
      cash: [],
      trades: [],
      cashMovements: [],
      history: [],
    })
    expect(urls[0]!.searchParams.get("id")).toBe("F0GBR052TN]2]0]FOALL$$ALL")
    expect(urls[0]!.searchParams.get("currencyId")).toBe("EUR")
  })

  it("takes a pension plan's Morningstar id as its symbol", async () => {
    const { stub } = morningstarStub([], [[1792713600000, 20.132]])
    const plan = { id: "F000016CB6", isin: null, name: "Myinvestor Indexado Global PP", currency: "EUR", units: 10 }
    const [account] = await myinvestor({ funds: [plan] }, { fetch: stub }).accounts()
    expect(account!.positions[0]!.symbol).toBe("F000016CB6")
  })

  it("fails a fund Morningstar no longer prices, naming it", async () => {
    const { stub } = morningstarStub([], [])
    const read = myinvestor({ funds: [vanguard] }, { fetch: stub }).accounts()
    await expect(read).rejects.toBeInstanceOf(BrokerError)
    await expect(read).rejects.toMatchObject({ code: "invalid_credentials", message: expect.stringContaining(vanguard.name) })
  })

  it("answers unavailable when Morningstar is down", async () => {
    const stub = (async () => new Response("busy", { status: 503 })) as typeof fetch
    await expect(morningstar({ fetch: stub }).search("IE00B03HD191")).rejects.toMatchObject({ code: "unavailable" })
  })
})
