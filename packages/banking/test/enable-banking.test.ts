import { describe, expect, it } from "vitest"
import { accountKind, appToken, enableBanking, importRsaKey, mapTransactions, normalizePem, pickBalance, signRs256, type EbTransaction } from "../src/enable-banking/index.ts"
import { toBase64 } from "../src/enable-banking/jwt.ts"

const utf8 = (text: string) => new TextEncoder().encode(text)
const fromBase64Url = (text: string) => {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/")
  return Uint8Array.from(atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)), (char) => char.charCodeAt(0))
}

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
  it("signs debits negative and credits positive", () => {
    const [debit, credit] = mapTransactions([
      row({}),
      row({ credit_debit_indicator: "CRDT", transaction_amount: { amount: "2500.00", currency: "EUR" } }),
    ])
    expect(debit!.amountMinor).toBe(-1230)
    expect(credit!.amountMinor).toBe(250000)
  })

  it("joins remittance lines for the description and picks the other side as counterparty", () => {
    const [debit, credit] = mapTransactions([
      row({}),
      row({ credit_debit_indicator: "CRDT", remittance_information: [], debtor: { name: "ACME Payroll" } }),
    ])
    expect(debit!.description).toBe("CARD PAYMENT MERCADONA VALENCIA")
    expect(debit!.counterparty).toBe("Mercadona")
    expect(credit!.description).toBe("ACME Payroll")
    expect(credit!.counterparty).toBe("ACME Payroll")
  })

  it("skips rows without a date or an amount", () => {
    const mapped = mapTransactions([
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

describe("Enable Banking consents", () => {
  it("asks again at the bank's own limit when it refuses the listed one", async () => {
    const { pem } = await rsaPem()
    const asked: string[] = []
    const stub = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const until = JSON.parse(String(init!.body)).access.valid_until as string
      asked.push(until)
      if (asked.length === 1)
        return Response.json(
          { code: 422, message: "Wrong request parameters provided", detail: "ASPSP does not support consent validity more than 7776000 seconds in the future" },
          { status: 422 },
        )
      return Response.json({ url: "https://bank.example/consent" })
    }) as typeof fetch
    const bank = enableBanking({ appId: "app-123", privateKey: pem, fetch: stub })
    const input = { institution: { name: "MyInvestor Banco", country: "ES" }, state: "s", redirectUrl: "https://app.example/cb", validDays: 180 }
    expect(await bank.authorize(input)).toBe("https://bank.example/consent")
    const days = asked.map((until) => (Date.parse(until) - Date.now()) / 86_400_000)
    expect(days[0]).toBeCloseTo(180, 1)
    expect(days[1]).toBeLessThan(90)
    expect(days[1]).toBeGreaterThan(89.9)
  })
})

describe("Enable Banking application", () => {
  it("reads the environment, activation, and redirect URLs", async () => {
    const { pem } = await rsaPem()
    const stub = (async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://api.enablebanking.com/application")
      return Response.json({ name: "Finance", environment: "PRODUCTION", active: false, redirect_urls: ["https://app.example/api/connect/callback"] })
    }) as typeof fetch
    const app = await enableBanking({ appId: "app-application", privateKey: pem, fetch: stub }).application()
    expect(app).toEqual({ name: "Finance", environment: "production", active: false, redirectUrls: ["https://app.example/api/connect/callback"] })
  })

  it("reports any refusal as the app's credentials", async () => {
    const { pem } = await rsaPem()
    const stub = (async () => Response.json({ message: "Unauthorized" }, { status: 401 })) as typeof fetch
    await expect(enableBanking({ appId: "app-refused", privateKey: pem, fetch: stub }).application()).rejects.toMatchObject({ code: "invalid_credentials" })
  })
})
