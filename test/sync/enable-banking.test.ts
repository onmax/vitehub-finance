import { describe, expect, it } from "vitest"
import { accountKind, appToken, mapTransactions, pickBalance, type EbTransaction } from "../../server/providers/enable-banking"
import { fromBase64Url, importRsaKey, normalizePem, signRs256, toBase64, utf8 } from "../../server/providers/crypto"

const row = (overrides: Partial<EbTransaction>): EbTransaction => ({
  transaction_amount: { amount: "12.30", currency: "EUR" },
  credit_debit_indicator: "DBIT",
  booking_date: "2026-10-20",
  remittance_information: ["CARD PAYMENT", "MERCADONA VALENCIA"],
  creditor: { name: "Mercadona" },
  debtor: { name: "Maxi" },
  ...overrides,
})

describe("Enable Banking transactions", () => {
  it("signs debits negative and credits positive", async () => {
    const [debit, credit] = await mapTransactions([
      row({}),
      row({ credit_debit_indicator: "CRDT", transaction_amount: { amount: "2500.00", currency: "EUR" } }),
    ])
    expect(debit!.amountMinor).toBe(-1230)
    expect(credit!.amountMinor).toBe(250000)
  })

  it("joins remittance lines for the description and picks the other side as counterparty", async () => {
    const [debit, credit] = await mapTransactions([
      row({}),
      row({ credit_debit_indicator: "CRDT", remittance_information: [], debtor: { name: "ACME Payroll" } }),
    ])
    expect(debit!.description).toBe("CARD PAYMENT MERCADONA VALENCIA")
    expect(debit!.counterparty).toBe("Mercadona")
    expect(credit!.description).toBe("ACME Payroll")
    expect(credit!.counterparty).toBe("ACME Payroll")
  })

  it("prefers the bank's id for the dedupe key", async () => {
    const [withId, withReference] = await mapTransactions([
      row({ transaction_id: "T-1", entry_reference: "E-1" }),
      row({ entry_reference: "E-2" }),
    ])
    expect(withId!.dedupeKey).toBe("id:T-1")
    expect(withReference!.dedupeKey).toBe("id:E-2")
  })

  it("keeps hash keys stable across fetches and distinct for identical same-day rows", async () => {
    const fetch = [row({}), row({}), row({ booking_date: "2026-10-21" })]
    const first = await mapTransactions(fetch)
    const second = await mapTransactions(structuredClone(fetch))
    expect(first.map((item) => item.dedupeKey)).toEqual(second.map((item) => item.dedupeKey))
    expect(first[0]!.dedupeKey).not.toBe(first[1]!.dedupeKey)
    expect(first.every((item) => item.dedupeKey?.startsWith("h:"))).toBe(true)
    // Whitespace and case in the description don't make a new transaction.
    const [noisy] = await mapTransactions([row({ remittance_information: ["card  payment", "Mercadona valencia "] })])
    expect(noisy!.dedupeKey).toBe(first[0]!.dedupeKey)
  })

  it("skips rows without a date or an amount", async () => {
    const mapped = await mapTransactions([
      row({ booking_date: null, value_date: null, transaction_date: null }),
      row({ transaction_amount: { amount: "abc", currency: "EUR" } }),
      row({ booking_date: null, value_date: "2026-10-19" }),
    ])
    expect(mapped).toHaveLength(1)
    expect(mapped[0]!.date).toBe("2026-10-19")
  })

  it("picks the available balance first", () => {
    expect(
      pickBalance([
        { balance_type: "CLBD", balance_amount: { amount: "10.00", currency: "EUR" } },
        { balance_type: "ITAV", balance_amount: { amount: "12.00", currency: "EUR" } },
      ]),
    ).toEqual({ amount: "12.00", currency: "EUR" })
    expect(pickBalance([{ balance_type: "OTHR", balance_amount: { amount: "1.00", currency: "EUR" } }])?.amount).toBe("1.00")
    expect(pickBalance([])).toBeNull()
  })

  it("maps cash account types to kinds", () => {
    expect(accountKind("CACC")).toBe("checking")
    expect(accountKind("SVGS")).toBe("savings")
    expect(accountKind("CARD")).toBe("credit")
    expect(accountKind("LOAN")).toBe("loan")
    expect(accountKind(undefined)).toBe("checking")
  })
})

async function rsaPem() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey))
  const body = toBase64(pkcs8).match(/.{1,64}/g)!.join("\n")
  return { pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`, publicKey: pair.publicKey }
}

describe("RS256 app JWT", () => {
  it("signs a token WebCrypto verifies, with Enable Banking's header and claims", async () => {
    const { pem, publicKey } = await rsaPem()
    const now = 1_800_000_000
    const jwt = await appToken({ appId: "app-123", privateKey: pem }, now)
    const [header, payload, signature] = jwt.split(".")
    const decode = (part: string) => JSON.parse(new TextDecoder().decode(fromBase64Url(part)))
    expect(decode(header!)).toEqual({ typ: "JWT", kid: "app-123", alg: "RS256" })
    expect(decode(payload!)).toEqual({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 })
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, fromBase64Url(signature!), utf8(`${header}.${payload}`))
    expect(valid).toBe(true)
  })

  it("accepts a key whose newlines arrive escaped", async () => {
    const { pem, publicKey } = await rsaPem()
    const escaped = pem.replace(/\n/g, "\\n")
    expect(normalizePem(escaped)).toBe(pem.trim())
    const jwt = await signRs256({ typ: "JWT" }, { sub: "x" }, await importRsaKey(escaped))
    const [header, payload, signature] = jwt.split(".")
    expect(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, fromBase64Url(signature!), utf8(`${header}.${payload}`))).toBe(true)
  })

  it("explains how to convert a PKCS#1 key", async () => {
    await expect(importRsaKey("-----BEGIN RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----")).rejects.toThrow(
      /openssl pkcs8 -topk8 -nocrypt/,
    )
  })
})
