import { describe, expect, it } from "vitest"
import { BankingError, readAccounts, type BankAccount } from "../src/index.ts"
import { enableBanking } from "../src/enable-banking/index.ts"
import { fake } from "../src/fake.ts"

const account = (uid: string, extra: Record<string, unknown> = {}) => ({
  uid,
  name: `Bank ${uid}`,
  iban: null,
  currency: "EUR",
  kind: "checking" as const,
  balance: { amountMinor: 1000, currency: "EUR" },
  transactions: [{ externalId: null, date: "2026-10-20", amountMinor: -500, currency: "EUR", description: "Coffee", counterparty: null }],
  ...extra,
})
const plain = (entry: ReturnType<typeof account>): BankAccount => ({ uid: entry.uid, name: entry.name, iban: entry.iban, currency: entry.currency, kind: entry.kind })

describe("readAccounts", () => {
  it("keeps the other accounts when one fails", async () => {
    const accounts = [account("a"), account("b", { fail: "unavailable" }), account("c")]
    const reads = await readAccounts(fake({ accounts }), "consent", accounts.map(plain))
    expect(reads.map((read) => read.error?.code ?? "ok")).toEqual(["ok", "unavailable", "ok"])
    expect(reads[0]!.transactions).toHaveLength(1)
  })

  it("stops calling the bank after a rate limit, keeping what it read", async () => {
    const accounts = [account("a"), account("b", { fail: "rate_limited" }), account("c")]
    const reads = await readAccounts(fake({ accounts }), "consent", accounts.map(plain))
    expect(reads.map((read) => read.error?.code ?? "ok")).toEqual(["ok", "rate_limited", "rate_limited"])
  })

  it("throws when the limit hits before anything was read, or the consent expired", async () => {
    const limited = [account("a", { fail: "rate_limited" }), account("b")]
    await expect(readAccounts(fake({ accounts: limited }), "consent", limited.map(plain))).rejects.toMatchObject({ code: "rate_limited" })
    const expired = [account("a"), account("b", { fail: "expired" })]
    await expect(readAccounts(fake({ accounts: expired }), "consent", expired.map(plain))).rejects.toBeInstanceOf(BankingError)
  })

  it("passes `since` to the bank", async () => {
    const accounts = [account("a")]
    const reads = await readAccounts(fake({ accounts }), "consent", accounts.map(plain), { since: "2026-10-21" })
    expect(reads[0]!.transactions).toEqual([])
  })
})

/** Enable Banking's API, answered from a table of `METHOD path` → JSON, with the requests recorded. */
function api(routes: Record<string, unknown>) {
  const calls: string[] = []
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const key = `${init?.method ?? "GET"} ${url.pathname}`
    calls.push(`${key}${url.search}`)
    const answer = routes[key]
    if (typeof answer === "function") return answer(url)
    return answer === undefined ? new Response("not found", { status: 404 }) : Response.json(answer)
  }) as typeof fetch
  return { stub, calls }
}

async function appKey() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey))
  return `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----`
}

describe("Enable Banking provider", () => {
  it("names a consent's accounts by bank and currency, and reads balances and every page of transactions", async () => {
    const { stub, calls } = api({
      "POST /sessions": {
        session_id: "s-1",
        aspsp: { name: "Revolut", country: "LT" },
        access: { valid_until: "2027-04-24T00:00:00Z" },
        accounts: [
          { uid: "sek", name: "Álex Moreno Ruíz", currency: "SEK", account_id: { iban: "LT121000011101001000" } },
          { uid: "eur", name: "Álex Moreno Ruíz", currency: "EUR", account_id: { iban: "LT121000011101001000" } },
        ],
      },
      "GET /accounts/sek/balances": { balances: [{ balance_type: "CLBD", balance_amount: { amount: "1836.59", currency: "SEK" } }] },
      "GET /accounts/sek/transactions": (url: URL) =>
        Response.json(
          url.searchParams.get("continuation_key")
            ? { transactions: [{ transaction_amount: { amount: "40000.00", currency: "SEK" }, credit_debit_indicator: "CRDT", booking_date: "2026-10-07", remittance_information: ["Top-Up by *4821"] }] }
            : { transactions: [{ transaction_amount: { amount: "285.94", currency: "SEK" }, credit_debit_indicator: "DBIT", booking_date: "2026-10-01", creditor: { name: "Five Guys" } }], continuation_key: "next" },
        ),
    })
    const bank = enableBanking({ appId: "app", privateKey: await appKey(), fetch: stub })
    const consent = await bank.completeAuthorization("code")
    expect(consent.accounts.map((entry) => entry.name)).toEqual(["Revolut SEK", "Revolut EUR"])
    expect(consent.expiresAt?.toISOString()).toBe("2027-04-24T00:00:00.000Z")
    expect(await bank.balance(consent.id, "sek")).toEqual({ amountMinor: 183659, currency: "SEK" })
    const rows = await bank.transactions(consent.id, "sek", { since: "2026-10-01" })
    expect(rows.map((row) => [row.amountMinor, row.description])).toEqual([
      [-28594, "Five Guys"],
      [4000000, "Top-Up by *4821"],
    ])
    expect(calls).toContain("GET /accounts/sek/transactions?transaction_status=BOOK&date_from=2026-10-01&continuation_key=next")
  })

  it("tells an expired consent from rejected app credentials", async () => {
    const privateKey = await appKey()
    const expired = enableBanking({ appId: "app", privateKey, fetch: api({ "GET /accounts/a/balances": () => Response.json({ error: "EXPIRED_SESSION" }, { status: 401 }) }).stub })
    await expect(expired.balance("s", "a")).rejects.toMatchObject({ code: "expired" })
    const rejected = enableBanking({ appId: "app", privateKey, fetch: api({ "GET /aspsps": () => Response.json({ message: "Invalid JWT" }, { status: 401 }) }).stub })
    await expect(rejected.institutions("ES")).rejects.toMatchObject({ code: "invalid_credentials" })
  })
})
