import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { BrokerError, ibkr, IBKR_FLEX_URL, parseFlexStatement } from "../src/index.ts"
import { fake } from "../src/fake.ts"

const statement = readFileSync(new URL("./fixtures/activity-statement.xml", import.meta.url), "utf8")
// The same statement as a query set to CSV writes it: each section's column names, then its rows.
const csvStatement = readFileSync(new URL("./fixtures/activity-statement.csv", import.meta.url), "utf8")

const flexResponse = (fields: string) =>
  `<FlexStatementResponse timestamp='26 October, 2026 02:58 PM EDT'>\n${fields}\n</FlexStatementResponse>`
const success = flexResponse(
  `<Status>Success</Status><ReferenceCode>7357</ReferenceCode><Url>${IBKR_FLEX_URL}/GetStatement</Url>`,
)
const failure = (code: string, message: string) => flexResponse(`<Status>Fail</Status><ErrorCode>${code}</ErrorCode><ErrorMessage>${message}</ErrorMessage>`)

/** A fetch for the Flex Web Service: SendRequest answers `sent`, GetStatement each of `statements` in turn (the last repeats). */
function flexStub(sent: string, statements: string[] = []) {
  const calls: Array<{ path: string; params: Record<string, string>; userAgent: string | null }> = []
  let polls = 0
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push({ path: url.pathname.split("/").at(-1)!, params: Object.fromEntries(url.searchParams), userAgent: new Headers(init?.headers).get("user-agent") })
    const body = url.pathname.endsWith("/SendRequest") ? sent : statements[Math.min(polls++, statements.length - 1)]!
    return new Response(body, { status: 200, headers: { "content-type": "text/xml;charset=UTF-8" } })
  }) as typeof fetch
  return { stub, calls }
}

const credentials = { token: " 123456789012345678901234 ", queryId: "987654" }

describe("Flex statements", () => {
  it("reads positions at IBKR's prices and cash per currency", () => {
    const [account] = parseFlexStatement(statement)
    expect(account!.id).toBe("U1234567")
    expect(account!.positions).toEqual([
      { symbol: "VWCE", description: "VANG FTSE AW USDA", assetClass: "STK", quantity: 42, markPrice: 138.56, value: 5819.52, currency: "EUR", id: "358689487", isin: "IE00BK5BQT80" },
      { symbol: "AAPL", description: "APPLE INC", assetClass: "STK", quantity: 10, markPrice: 251.3, value: 2513, currency: "USD", id: "265598", isin: "US0378331005" },
      { symbol: "AAPL  261218C00300000", description: "AAPL 18DEC26 300 C", assetClass: "OPT", quantity: -1, markPrice: 4.15, value: -415, currency: "USD", id: "712345678", isin: null },
    ])
    // BASE_SUMMARY is the other currencies converted, and an empty currency is left out.
    expect(account!.cash).toEqual([
      { currency: "EUR", amount: 5250.75 },
      { currency: "USD", amount: 1314.03 },
    ])
  })

  it("reads the period's trades, cash movements, and daily value", () => {
    const [account] = parseFlexStatement(statement)
    // Executions only: the order row repeats them.
    expect(account!.trades).toEqual([
      { id: "741852963", date: "2026-10-02", symbol: "VWCE", description: "VANG FTSE AW USDA", quantity: 28, price: 167.5, netCash: -4693, currency: "EUR" },
    ])
    expect(account!.cashMovements).toEqual([
      { id: "1110001", date: "2026-10-01", type: "Deposits/Withdrawals", description: "CASH RECEIPTS / ELECTRONIC FUND TRANSFERS", amount: 5000, currency: "EUR" },
      { id: "1110002", date: "2026-10-15", type: "Dividends", description: "AAPL(US0378331005) CASH DIVIDEND USD 0.26 PER SHARE (Ordinary Dividend)", amount: 2.6, currency: "USD" },
      { id: "1110003", date: "2026-10-15", type: "Withholding Tax", description: "AAPL(US0378331005) CASH DIVIDEND USD 0.26 PER SHARE - US TAX", amount: -0.39, currency: "USD" },
    ])
    expect(account!.history).toEqual([
      { date: "2026-10-22", value: 14072.4, currency: "EUR" },
      { date: "2026-10-23", value: 14213.55, currency: "EUR" },
    ])
  })

  it("reads dates in the other formats, and says when it can't", () => {
    const dashed = statement.replace(/(tradeDate|dateTime|reportDate|settleDate)="(\d{4})(\d{2})(\d{2})(;\d+)?"/g, '$1="$2-$3-$4"')
    expect(parseFlexStatement(dashed)).toEqual(parseFlexStatement(statement))
    const american = statement.replace(/reportDate="(\d{4})(\d{2})(\d{2})"/g, 'reportDate="$2/$3/$1"')
    expect(() => parseFlexStatement(american)).toThrow(expect.objectContaining({ code: "invalid_credentials", message: expect.stringContaining("yyyyMMdd") }))
  })

  it("adds lots up when the query has no summary rows", () => {
    const lots = statement.replace(/levelOfDetail="SUMMARY"/g, 'levelOfDetail="IGNORED"').replace(
      /(<OpenPosition [^>]*symbol="AAPL" [^>]*levelOfDetail="LOT"[^>]*\/>)/,
      `$1\n${'<OpenPosition currency="USD" assetCategory="STK" symbol="AAPL" description="APPLE INC" conid="265598" position="5" markPrice="251.3" positionValue="1256.5" levelOfDetail="LOT" />'}`,
    )
    const [account] = parseFlexStatement(lots)
    expect(account!.positions).toMatchObject([{ symbol: "AAPL", quantity: 15, value: 3769.5 }])
  })

  it("reads the same statement from a query in CSV or Text", () => {
    const fromXml = parseFlexStatement(statement)
    expect(parseFlexStatement(csvStatement)).toEqual(fromXml)
    // "Include header and trailer records" frames the rows; Text separates cells with a bar.
    const framed = ['"BOF","U1234567"', ...csvStatement.trim().split("\n").map((line) => (line.startsWith('"ClientAccountID"') ? `"HEADER","POST",${line}` : `"DATA","POST",${line}`)), '"EOF","U1234567"'].join("\n")
    expect(parseFlexStatement(framed)).toEqual(fromXml)
    const text = csvStatement.replace(/"1,314\.03"/, '"1314.03"').replace(/","/g, "|").replace(/"/g, "")
    expect(parseFlexStatement(text)).toEqual(fromXml)
  })

  it("asks for the Open Positions and Cash Report sections", () => {
    const empty = `<FlexQueryResponse queryName="q" type="AF"><FlexStatements count="1"><FlexStatement accountId="U1"><Trades /></FlexStatement></FlexStatements></FlexQueryResponse>`
    expect(() => parseFlexStatement(empty)).toThrow(expect.objectContaining({ code: "invalid_credentials", message: expect.stringContaining("Open Positions") }))
  })
})

describe("Interactive Brokers", () => {
  it("sends the query, waits while IBKR generates the statement, then reads it", async () => {
    const { stub, calls } = flexStub(success, [failure("1019", "Statement generation in progress. Please try again shortly."), statement])
    const accounts = await ibkr(credentials, { fetch: stub, pollIntervalMs: 0 }).accounts()
    expect(accounts.map((account) => [account.id, account.positions.length, account.cash.length])).toEqual([["U1234567", 3, 2]])
    expect(calls.map(({ path, params }) => [path, params])).toEqual([
      ["SendRequest", { t: "123456789012345678901234", q: "987654", v: "3" }],
      ["GetStatement", { t: "123456789012345678901234", q: "7357", v: "3" }],
      ["GetStatement", { t: "123456789012345678901234", q: "7357", v: "3" }],
    ])
    // IBKR's edge refuses requests without a User-Agent.
    expect(calls.every((call) => call.userAgent)).toBe(true)
  })

  it("says what to fix when IBKR refuses the token or the query", async () => {
    for (const [code, message, expected] of [
      ["1015", "Token is invalid.", "The Flex token isn't valid"],
      ["1012", "Token has expired.", "has expired"],
      ["1014", "Query is invalid.", "The Query ID isn't valid"],
      ["1020", "Invalid request or unable to validate request.", "Check the Flex token and the Query ID"],
    ] as const) {
      const { stub } = flexStub(failure(code, message))
      await expect(ibkr(credentials, { fetch: stub }).accounts()).rejects.toMatchObject({ code: "invalid_credentials", provider: "ibkr", message: expect.stringContaining(expected) })
    }
  })

  it("passes on IBKR's limits and outages", async () => {
    const limited = flexStub(failure("1018", "Too many requests have been made from this token."))
    await expect(ibkr(credentials, { fetch: limited.stub }).accounts()).rejects.toMatchObject({ code: "rate_limited" })
    const busy = flexStub(failure("1003", "Statement is not available."))
    await expect(ibkr(credentials, { fetch: busy.stub }).accounts()).rejects.toMatchObject({
      code: "unavailable",
      message: "Interactive Brokers couldn't send the statement. Try again later. Details: Statement is not available (error 1003).",
    })
    const edge = (async () => new Response("Error 403 - Access Denied", { status: 403 })) as typeof fetch
    await expect(ibkr(credentials, { fetch: edge }).accounts()).rejects.toMatchObject({ code: "unavailable" })
  })

  it("gives up after a few polls, and reads a query that isn't XML", async () => {
    const slow = flexStub(success, [failure("1019", "Statement generation in progress.")])
    await expect(ibkr(credentials, { fetch: slow.stub, pollIntervalMs: 0, maxPolls: 3 }).accounts()).rejects.toMatchObject({ code: "unavailable" })
    expect(slow.calls.filter((call) => call.path === "GetStatement")).toHaveLength(3)
    const csv = flexStub(success, [csvStatement])
    expect(await ibkr(credentials, { fetch: csv.stub }).accounts()).toEqual(parseFlexStatement(statement))
    const trades = flexStub(success, ['"ClientAccountID","Symbol","TradePrice"\n"U1234567","AAPL","251.3"'])
    await expect(ibkr(credentials, { fetch: trades.stub }).accounts()).rejects.toMatchObject({ code: "invalid_credentials", message: expect.stringContaining("Open Positions") })
  })

  it("checks the credentials' shape before calling", async () => {
    const { stub, calls } = flexStub(success)
    await expect(ibkr({ token: "abc", queryId: "Q-1" }, { fetch: stub }).accounts()).rejects.toBeInstanceOf(BrokerError)
    expect(calls).toHaveLength(0)
  })
})

describe("fake", () => {
  it("answers what it's given, or fails", async () => {
    await expect(fake({ accounts: [{ id: "U1", positions: [], cash: [], trades: [], cashMovements: [], history: [] }] }).accounts()).resolves.toHaveLength(1)
    await expect(fake({ fail: "rate_limited" }).accounts()).rejects.toMatchObject({ code: "rate_limited" })
  })
})
