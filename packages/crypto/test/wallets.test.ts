import { describe, expect, it } from "vitest"
import { connect, createCrypto, CryptoError, fromBaseUnits, nimiq, parseAddress, parseNimiqAddress } from "../src/index.ts"
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
