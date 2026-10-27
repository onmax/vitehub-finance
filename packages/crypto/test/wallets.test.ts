import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { bitcoin, connect, createCrypto, CryptoError, fromBaseUnits, nimiq, parseAddress, parseNimiqAddress, xrpl, XRPL_SERVERS } from "../src/index.ts"
import { fake } from "../src/fake.ts"

/** A fetch that answers JSON-RPC calls by method, and records them. */
function rpcStub(answers: Record<string, unknown>) {
  const calls: Array<{ url: string; method: string; params: unknown }> = []
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    calls.push({ url: String(input), method: body.method, params: body.params })
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, ...(answers[body.method] as object) }), { status: 200 })
  }) as typeof fetch
  return { stub, calls }
}

describe("addresses", () => {
  it("validates addresses per chain", () => {
    expect(parseAddress("bitcoin", " 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa ")).toBe("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")
    expect(parseAddress("bitcoin", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).not.toBeNull()
    expect(parseAddress("bitcoin", "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBeNull()
    expect(parseAddress("ethereum", "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).not.toBeNull()
    expect(parseAddress("ethereum", "0x123")).toBeNull()
    expect(parseAddress("xrpl", "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh")).not.toBeNull()
    expect(parseAddress("xrpl", "xHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh")).toBeNull()
    expect(parseAddress("solana", "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg")).not.toBeNull()
    expect(parseAddress("solana", "0OIl")).toBeNull()
  })

  it("normalizes Nimiq addresses and checks their IBAN digits", () => {
    const spaced = "NQ07 0000 0000 0000 0000 0000 0000 0000 0000"
    expect(parseNimiqAddress(`nq07${"0".repeat(32)}`)).toBe(spaced)
    expect(parseNimiqAddress(" NQ26 0000 0000 02A5 YAK7 4QNF 9MH0 TE2B GVRU ")).toBe("NQ26 0000 0000 02A5 YAK7 4QNF 9MH0 TE2B GVRU")
    // A wrong check digit, a letter outside Nimiq's alphabet (O), and a short address.
    expect(parseNimiqAddress("NQ08 0000 0000 0000 0000 0000 0000 0000 0000")).toBeNull()
    expect(parseNimiqAddress("NQ07 OOOO 0000 0000 0000 0000 0000 0000 0000")).toBeNull()
    expect(parseNimiqAddress("NQ07 0000 0000")).toBeNull()
    expect(parseAddress("nimiq", spaced)).toBe(spaced)
  })

  it("refuses to watch an address that isn't the chain's", () => {
    expect(() => nimiq("NQ08 0000 0000 0000 0000 0000 0000 0000 0000")).toThrow(CryptoError)
    try {
      connect("ethereum", { address: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh" })
    } catch (error) {
      expect((error as CryptoError).code).toBe("invalid_address")
    }
  })

  it("converts base units without losing wei", () => {
    expect(fromBaseUnits(150000000n, 8)).toBe(1.5)
    expect(fromBaseUnits(1234567890123456789n, 18)).toBeCloseTo(1.234567890123456789, 15)
    expect(fromBaseUnits(55612305180n, 5)).toBe(556123.0518)
  })
})

describe("Nimiq wallet", () => {
  const address = "NQ26 0000 0000 02A5 YAK7 4QNF 9MH0 TE2B GVRU"

  it("adds what the address stakes to its balance, from luna", async () => {
    const { stub, calls } = rpcStub({
      getAccountByAddress: { result: { data: { address, balance: 1_250_000, type: "basic" } } },
      getStakerByAddress: { result: { data: { address, balance: 10_000_000, inactiveBalance: 500_000, retiredBalance: 0 } } },
    })
    const [holding] = await nimiq(address, { fetch: stub }).balances()
    expect(holding).toEqual({ symbol: "NIM", name: "Nimiq", quantity: 117.5, staked: 105 })
    expect(calls.map((call) => [call.url, call.method, call.params])).toEqual([
      ["https://rpc.nimiqwatch.com", "getAccountByAddress", [address]],
      ["https://rpc.nimiqwatch.com", "getStakerByAddress", [address]],
    ])
  })

  it("reads an address that never staked, and another endpoint when asked", async () => {
    const { stub, calls } = rpcStub({
      getAccountByAddress: { result: { data: { address, balance: 100_000 } } },
      getStakerByAddress: { error: { code: -32603, message: "Internal error", data: `No staker with address: ${address}` } },
    })
    const [holding] = await nimiq(address, { fetch: stub, rpcUrl: "http://127.0.0.1:8648" }).balances()
    expect(holding).toMatchObject({ quantity: 1, staked: 0 })
    expect(calls[0]!.url).toBe("http://127.0.0.1:8648")
  })

  it("says the RPC is unavailable when the account call fails", async () => {
    const { stub } = rpcStub({ getAccountByAddress: { error: { code: -32603, message: "Internal error" } } })
    await expect(nimiq(address, { fetch: stub }).balances()).rejects.toMatchObject({ code: "unavailable", provider: "nimiq" })
  })
})

/** A fetch that answers each URL with the next of its responses (the last one repeats), and records the calls. */
function urlStub(answers: Record<string, Array<() => Response>>) {
  const calls: Array<{ url: string; body: any }> = []
  const seen = new Map<string, number>()
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
    const list = answers[url]
    if (!list) throw new TypeError("fetch failed")
    const index = seen.get(url) ?? 0
    seen.set(url, index + 1)
    return list[Math.min(index, list.length - 1)]!()
  }) as typeof fetch
  return { stub, calls }
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status })

describe("XRP Ledger servers", () => {
  const address = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"
  const [first, second, third] = XRPL_SERVERS as [string, string, string]
  const funded = json({ result: { account_data: { Account: address, Balance: "125500000" }, status: "success" } })

  it("moves on from a server that rate limits, by status or by message", async () => {
    const { stub, calls } = urlStub({
      [first]: [() => new Response("Too Many Requests", { status: 429 })],
      [second]: [json({ error: "rate limit: units quota (2000 per 10s) exhausted, retry in ~10367ms" })],
      [third]: [funded],
    })
    const [holding] = await xrpl(address, { fetch: stub }).balances()
    expect(holding).toMatchObject({ symbol: "XRP", quantity: 125.5 })
    expect(calls.map((call) => call.url)).toEqual([first, second, third])
    expect(calls[0]!.body).toEqual({ method: "account_info", params: [{ account: address, ledger_index: "validated" }] })
  })

  it("moves on from a server that is down or out of sync", async () => {
    const { stub, calls } = urlStub({
      [second]: [json({ result: { error: "noNetwork", status: "error" } })],
      [third]: [funded],
    })
    await expect(xrpl(address, { fetch: stub }).balances()).resolves.toMatchObject([{ quantity: 125.5 }])
    expect(calls).toHaveLength(3)
  })

  it("says rate_limited when every server is, in words a person can act on", async () => {
    const { stub } = urlStub({
      [first]: [json({ result: { error: "slowDown", error_message: "You are placing too much load on the server." } }, 503)],
      [second]: [() => new Response("", { status: 429 })],
      [third]: [json({ error: "rate limit: units quota (2000 per 10s) exhausted, retry in ~10367ms" })],
    })
    const failure = await xrpl(address, { fetch: stub }).balances().catch((error) => error)
    expect(failure).toMatchObject({ code: "rate_limited", provider: "xrpl" })
    expect(failure.message).toBe("XRP Ledger servers are busy. Try again in a few minutes.")
  })

  it("only asks the server it's given, and reads an unfunded address as empty", async () => {
    const { stub, calls } = urlStub({ "http://127.0.0.1:5005": [json({ result: { error: "actNotFound", status: "error" } })] })
    await expect(xrpl(address, { fetch: stub, rpcUrl: "http://127.0.0.1:5005" }).balances()).resolves.toMatchObject([{ quantity: 0 }])
    expect(calls.map((call) => call.url)).toEqual(["http://127.0.0.1:5005"])
  })
})

describe("XRP Ledger history", () => {
  const address = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"
  const other = "rUrYCcn3UkgC2ZXDWDvWT1D8VmM2X5Yiws"
  const exchange = "rLNaPoKeeBjZe2qs6x52yVPZpZ8td4dc6w"
  const ledgerTime = (date: string) => Date.parse(`${date}T12:00:00Z`) / 1000 - 946_684_800
  const root = (account: string, before: string, after: string) => ({
    ModifiedNode: { LedgerEntryType: "AccountRoot", FinalFields: { Account: account, Balance: after }, PreviousFields: { Balance: before } },
  })
  const entry = (hash: string, date: string, tx: object, nodes: object[]) => ({
    tx: { hash, date: ledgerTime(date), ...tx },
    meta: { TransactionResult: "tesSUCCESS", AffectedNodes: nodes },
    validated: true,
  })
  const page1 = [
    // Received 125.5 XRP.
    entry("A1", "2026-10-20", { TransactionType: "Payment", Account: other, Destination: address, Fee: "12" }, [root(address, "0", "125500000"), root(other, "200000000", "74499988")]),
    // Sent 10 XRP to an exchange, paying 12 drops.
    entry("A2", "2026-10-18", { TransactionType: "Payment", Account: address, Destination: exchange, DestinationTag: 7, Fee: "12" }, [root(address, "135500012", "125500000")]),
    // A trust line: only the fee.
    entry("A3", "2026-10-15", { TransactionType: "TrustSet", Account: address, Fee: "12" }, [root(address, "135500024", "135500012")]),
    // A payment in an issued currency: no XRP moved.
    entry("A4", "2026-10-14", { TransactionType: "Payment", Account: other, Destination: address, Amount: { currency: "USD", issuer: other, value: "5" } }, [
      { ModifiedNode: { LedgerEntryType: "RippleState", FinalFields: { Balance: { value: "5" } }, PreviousFields: { Balance: { value: "0" } } } },
    ]),
  ]
  const page2 = [
    // Sold 20 XRP on the DEX.
    entry("B1", "2026-10-10", { TransactionType: "OfferCreate", Account: address, Fee: "10" }, [root(address, "155500034", "135500024")]),
    entry("B2", "2026-09-01", { TransactionType: "Payment", Account: other, Destination: address, Fee: "12" }, [root(address, "0", "155500034")]),
  ]
  const pages = [
    json({ result: { transactions: page1, marker: { ledger: 1, seq: 2 }, status: "success" } }),
    json({ result: { transactions: page2, status: "success" } }),
  ]

  it("reads XRP payments, fees, and trades from the balance changes, page by page, until `since`", async () => {
    const { stub, calls } = urlStub({ [XRPL_SERVERS[0]!]: pages })
    const provider = xrpl(address, { fetch: stub })
    const transactions = await provider.transactions!({ since: "2026-10-01" })
    expect(transactions).toEqual([
      { id: "A1", date: "2026-10-20", symbol: "XRP", quantity: 125.5, fee: 0, counterparty: other, kind: "receive" },
      { id: "A2", date: "2026-10-18", symbol: "XRP", quantity: -10, fee: 0.000012, counterparty: exchange, kind: "send" },
      { id: "A3", date: "2026-10-15", symbol: "XRP", quantity: 0, fee: 0.000012, counterparty: null, kind: "fee" },
      { id: "B1", date: "2026-10-10", symbol: "XRP", quantity: -20, fee: 0.00001, counterparty: null, kind: "trade" },
    ])
    expect(calls.map((call) => call.body.params[0])).toEqual([
      { account: address, ledger_index_min: -1, ledger_index_max: -1, limit: 200, forward: false },
      { account: address, ledger_index_min: -1, ledger_index_max: -1, limit: 200, forward: false, marker: { ledger: 1, seq: 2 } },
    ])
  })

  it("has no history for an unfunded address", async () => {
    const { stub } = urlStub({ [XRPL_SERVERS[0]!]: [json({ result: { error: "actNotFound" } })] })
    await expect(xrpl(address, { fetch: stub }).transactions!()).resolves.toEqual([])
  })

  it("counts failed transactions' fees, escrows, cashed checks, and partial payments by the balance change", async () => {
    const failed = (hash: string, date: string, tx: object, nodes: object[], result: string) => ({ ...entry(hash, date, tx, nodes), meta: { TransactionResult: result, AffectedNodes: nodes } })
    const created = (account: string, balance: string) => ({ CreatedNode: { LedgerEntryType: "AccountRoot", NewFields: { Account: account, Balance: balance } } })
    const check = { DeletedNode: { LedgerEntryType: "Check", FinalFields: { Account: other, Destination: address, SendMax: "5000000" } } }
    const transactions = [
      // Cashed a 5 XRP check `other` wrote, paying 12 drops: 4.999988 more.
      entry("C6", "2026-10-26", { TransactionType: "CheckCash", Account: address, CheckID: "AB", Amount: "5000000", Fee: "12" }, [root(address, "300000000", "304999988"), root(other, "50000000", "45000000"), check]),
      // A payment that failed for lack of funds still burned its fee.
      failed("C5", "2026-10-25", { TransactionType: "Payment", Account: address, Destination: exchange, Amount: "999000000", Fee: "15" }, [root(address, "300000015", "300000000")], "tecUNFUNDED_PAYMENT"),
      // Someone else's escrow finished to this address: 20 XRP arrived from its owner.
      entry("C4", "2026-10-24", { TransactionType: "EscrowFinish", Account: exchange, Owner: other, OfferSequence: 9, Fee: "10" }, [root(address, "280000015", "300000015")]),
      // This address's own escrow back to itself, finished by itself: 50 XRP less the fee.
      entry("C3", "2026-10-23", { TransactionType: "EscrowFinish", Account: address, Owner: address, OfferSequence: 3, Fee: "10" }, [root(address, "230000025", "280000015")]),
      // Locked 50 XRP in escrow for itself.
      entry("C2", "2026-10-22", { TransactionType: "EscrowCreate", Account: address, Destination: address, Amount: "50000000", Fee: "10" }, [root(address, "280000035", "230000025")]),
      // A partial payment: 1,000 XRP asked, 280.000035 delivered, and the account created with it.
      entry("C1", "2026-10-21", { TransactionType: "Payment", Account: other, Destination: address, Amount: "1000000000", Flags: 131072, Fee: "12" }, [created(address, "280000035")]),
      // Someone else's check to this address, and someone else's escrow of an issued token: no XRP of this address moved.
      entry("C0", "2026-10-21", { TransactionType: "CheckCreate", Account: other, Destination: address, SendMax: "5000000", Fee: "12" }, [root(other, "100", "88")]),
    ]
    const { stub } = urlStub({ [XRPL_SERVERS[0]!]: [json({ result: { transactions, status: "success" } })] })
    const parsed = await xrpl(address, { fetch: stub }).transactions!()
    expect(parsed.map(({ id, quantity, fee, counterparty, kind }) => [id, quantity, fee, counterparty, kind])).toEqual([
      ["C6", 5, 0.000012, other, "receive"],
      ["C5", 0, 0.000015, null, "fee"],
      ["C4", 20, 0, other, "receive"],
      ["C3", 50, 0.00001, null, "escrow"],
      ["C2", -50, 0.00001, null, "escrow"],
      ["C1", 280.000035, 0, other, "receive"],
    ])
    // Every change, fees included, adds up to the balance after the newest transaction.
    const drops = parsed.reduce((sum, row) => sum + Math.round((row.quantity - row.fee) * 1e6), 0)
    expect(drops).toBe(304_999_988)
  })
})

describe("XRP Ledger history of a real address", () => {
  // `account_tx` and `account_info` for rRedactedXrpAddress01xxxxxxxxxxx, recorded from s1.ripple.com at validated
  // ledger 107932070 (2026-10-27): 25 transactions, of which 9 payments changed its XRP balance.
  const address = "rRedactedXrpAddress01xxxxxxxxxxx"
  const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/xrpl-redacted-${name}.json`, import.meta.url), "utf8"))
  const accountTx = fixture("account_tx")
  const accountInfo = fixture("account_info")
  const read = async () => {
    const { stub } = urlStub({ [XRPL_SERVERS[0]!]: [json(accountTx)] })
    return xrpl(address, { fetch: stub }).transactions!()
  }

  it("reads the payments and leaves out other people's checks and token escrows", async () => {
    expect(accountTx.result.transactions).toHaveLength(25)
    const parsed = await read()
    const sender = "rRedactedXrpAddress06xxxxxxxxxxx"
    expect(parsed.map(({ date, kind, quantity, fee, counterparty }) => [date, kind, quantity, fee, counterparty])).toEqual([
      ["2026-08-26", "receive", 0.000001, 0, "rRedactedXrpAddress04xxxxxxxxxxx"],
      ["2026-08-26", "receive", 0.000001, 0, "rRedactedXrpAddress04xxxxxxxxxxx"],
      ["2026-08-23", "receive", 0.000001, 0, "rRedactedXrpAddress10xxxxxxxxxxx"],
      ["2026-08-01", "receive", 0.000002, 0, "rRedactedXrpAddress05xxxxxxxxxxx"],
      ["2026-08-01", "receive", 3559.800466, 0, sender],
      ["2026-08-01", "receive", 0.000002, 0, "rRedactedXrpAddress05xxxxxxxxxxx"],
      ["2026-08-01", "receive", 43788.683248, 0, sender],
      ["2026-08-01", "receive", 0.000002, 0, "rRedactedXrpAddress05xxxxxxxxxxx"],
      ["2026-08-01", "receive", 13.7, 0, sender],
    ])
    expect(new Set(parsed.map((row) => row.id)).size).toBe(9)
  })

  it("adds up to the balance on the ledger", async () => {
    const parsed = await read()
    // The account was created by its first payment, so before it the address held nothing.
    const drops = parsed.reduce((sum, row) => sum + Math.round((row.quantity - row.fee) * 1e6), 0)
    expect(String(drops)).toBe(accountInfo.result.account_data.Balance)
    const [holding] = await xrpl(address, { fetch: urlStub({ [XRPL_SERVERS[0]!]: [json(accountInfo)] }).stub }).balances()
    expect(holding!.quantity).toBe(0)
  })
})

describe("Nimiq history", () => {
  const address = "NQ26 0000 0000 02A5 YAK7 4QNF 9MH0 TE2B GVRU"
  const other = "NQ08 ACT8 T0FE PTG8 P5RL H2S3 QGXH V15R NVXY"
  const staking = "NQ77 0000 0000 0000 0000 0000 0000 0000 0001"
  const at = (date: string) => Date.parse(`${date}T08:00:00Z`)
  const tx = (hash: string, date: string, from: string, to: string, value: number, fee = 0, executionResult = true) => ({
    hash,
    timestamp: at(date),
    from,
    to,
    value,
    fee,
    executionResult,
    relatedAddresses: [from, to, address],
  })

  it("tells sends, receipts, staking, and rewards apart, until `since`", async () => {
    const { stub, calls } = rpcStub({
      getTransactionsByAddress: {
        result: {
          data: [
            tx("h1", "2026-10-20", other, address, 12_550_000),
            tx("h2", "2026-10-19", address, other, 1_000_000, 100),
            tx("h3", "2026-10-18", address, staking, 50_000_000),
            tx("h4", "2026-10-17", other, staking, 320_000),
            tx("h5", "2026-10-16", "NQ81 C01N BASE 0000 0000 0000 0000 0000 0000", address, 3_258_607),
            tx("h6", "2026-10-15", address, other, 5_000_000, 100, false),
            tx("h7", "2026-09-01", other, address, 100_000),
          ],
        },
      },
    })
    const transactions = await nimiq(address, { fetch: stub }).transactions!({ since: "2026-10-01" })
    expect(transactions.map(({ id, quantity, fee, counterparty, kind }) => [id, quantity, fee, counterparty, kind])).toEqual([
      ["h1", 125.5, 0, other, "receive"],
      ["h2", -10, 0.001, other, "send"],
      ["h3", -500, 0, null, "stake"],
      ["h4", 3.2, 0, other, "reward"],
      ["h5", 32.58607, 0, null, "reward"],
    ])
    expect(transactions[0]).toMatchObject({ date: "2026-10-20", symbol: "NIM" })
    expect(calls[0]!.params).toEqual([address, 200, null])
  })

  it("pages with the last hash it saw", async () => {
    const full = Array.from({ length: 200 }, (_, index) => tx(`p${index}`, "2026-10-20", other, address, 100_000))
    let call = 0
    const stub = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      call += 1
      const data = call === 1 ? full : [tx("last", "2026-10-19", other, address, 100_000)]
      expect(body.params[2]).toBe(call === 1 ? null : "p199")
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { data } }))
    }) as typeof fetch
    const transactions = await nimiq(address, { fetch: stub }).transactions!()
    expect(transactions).toHaveLength(201)
    expect(call).toBe(2)
  })
})

describe("Bitcoin history", () => {
  const address = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"
  const other = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
  const out = (scriptpubkey_address: string, value: number) => ({ scriptpubkey_address, value })
  const at = (date: string) => Date.parse(`${date}T08:00:00Z`) / 1000

  it("nets inputs and outputs, and leaves the fee apart when the address paid it", async () => {
    const { stub, calls } = urlStub({
      "https://mempool.space/api/address/bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq/txs/chain": [
        json([
          { txid: "t0", fee: 500, status: { confirmed: false }, vin: [], vout: [out(address, 1)] },
          // Sent 0.1 BTC, change back to itself, 1000 sats fee.
          { txid: "t1", fee: 1000, status: { confirmed: true, block_time: at("2026-10-20") }, vin: [{ prevout: out(address, 50_000_000) }], vout: [out(other, 10_000_000), out(address, 39_999_000)] },
          { txid: "t2", fee: 300, status: { confirmed: true, block_time: at("2026-10-01") }, vin: [{ prevout: out(other, 60_000_000) }], vout: [out(address, 50_000_000)] },
          { txid: "t3", fee: 300, status: { confirmed: true, block_time: at("2025-01-01") }, vin: [{ prevout: out(other, 1) }], vout: [out(address, 1)] },
        ]),
      ],
    })
    const transactions = await bitcoin(address, { fetch: stub }).transactions!({ since: "2026-01-01" })
    expect(transactions).toEqual([
      { id: "t1", date: "2026-10-20", symbol: "BTC", quantity: -0.1, fee: 0.00001, counterparty: other, kind: "send" },
      { id: "t2", date: "2026-10-01", symbol: "BTC", quantity: 0.5, fee: 0, counterparty: other, kind: "receive" },
    ])
    expect(calls).toHaveLength(1)
  })

  it("isn't offered on chains without a public history", () => {
    expect(connect("ethereum", { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" }).transactions).toBeUndefined()
  })
})

describe("createCrypto", () => {
  it("adds holdings up per coin and keeps going when one provider fails", async () => {
    const client = createCrypto([
      fake({ name: "Exchange", holdings: [{ symbol: "BTC", quantity: 0.5 }, { symbol: "NIM", quantity: 1000, staked: 1000 }] }),
      fake({ name: "Wallet", kind: "wallet", holdings: [{ symbol: "NIM", quantity: 250 }] }),
      fake({ name: "Broken", fail: "rate_limited" }),
    ])
    const { holdings, failed } = await client.totals()
    expect(holdings).toEqual([
      { symbol: "BTC", name: null, quantity: 0.5, staked: 0 },
      { symbol: "NIM", name: null, quantity: 1250, staked: 1000 },
    ])
    expect(failed.map((result) => [result.provider.name, result.error?.code])).toEqual([["Broken", "rate_limited"]])
  })
})
