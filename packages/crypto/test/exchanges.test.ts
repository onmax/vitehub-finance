import { describe, expect, it } from "vitest"
import { coinbaseJwt, krakenSignature, mergeHoldings, normalizeBinanceAsset, normalizeKrakenAsset } from "../src/index.ts"
import { fromBase64, fromBase64Url, toBase64, utf8 } from "../src/signing.ts"

describe("Kraken assets", () => {
  it("normalizes legacy codes", () => {
    expect(normalizeKrakenAsset("XXBT")).toBe("BTC")
    expect(normalizeKrakenAsset("XBT")).toBe("BTC")
    expect(normalizeKrakenAsset("XETH")).toBe("ETH")
    expect(normalizeKrakenAsset("XXRP")).toBe("XRP")
    expect(normalizeKrakenAsset("ZEUR")).toBe("EUR")
    expect(normalizeKrakenAsset("ZUSD")).toBe("USD")
    expect(normalizeKrakenAsset("XXLM")).toBe("XLM")
    expect(normalizeKrakenAsset("XLTC")).toBe("LTC")
    expect(normalizeKrakenAsset("XXDG")).toBe("DOGE")
  })

  it("folds staking and reward variants into the coin", () => {
    expect(normalizeKrakenAsset("DOT.S")).toBe("DOT")
    expect(normalizeKrakenAsset("ETH2.S")).toBe("ETH")
    expect(normalizeKrakenAsset("ETH2")).toBe("ETH")
    expect(normalizeKrakenAsset("USDC.M")).toBe("USDC")
    expect(normalizeKrakenAsset("XBT.M")).toBe("BTC")
    expect(normalizeKrakenAsset("SOL.F")).toBe("SOL")
    expect(normalizeKrakenAsset("ADA.B")).toBe("ADA")
    expect(normalizeKrakenAsset("DOT28.S")).toBe("DOT")
  })

  it("leaves modern tickers alone", () => {
    expect(normalizeKrakenAsset("SOL")).toBe("SOL")
    expect(normalizeKrakenAsset("USDT")).toBe("USDT")
    expect(normalizeKrakenAsset("API3")).toBe("API3")
    expect(normalizeKrakenAsset("ZETA")).toBe("ZETA")
    expect(normalizeKrakenAsset("XTZ")).toBe("XTZ")
  })

  it("merges variants of one coin", () => {
    const merged = mergeHoldings(
      ["XXBT", "XBT.M", "DOT", "DOT.S", "ZEUR", "KFEE"].map((code, index) => ({
        symbol: normalizeKrakenAsset(code),
        quantity: [0.5, 0.25, 10, 5, 100, 0][index]!,
      })),
    )
    expect(merged).toEqual([
      { symbol: "BTC", name: null, quantity: 0.75, staked: 0 },
      { symbol: "DOT", name: null, quantity: 15, staked: 0 },
      { symbol: "EUR", name: null, quantity: 100, staked: 0 },
    ])
  })

  it("signs like Kraken's documented example", async () => {
    // From docs.kraken.com (REST authentication).
    const secret = "kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg=="
    const postData = "nonce=1616492376594&ordertype=limit&pair=XBTUSD&price=37500&type=buy&volume=1.25"
    const signature = await krakenSignature("/0/private/AddOrder", "1616492376594", postData, secret)
    expect(signature).toBe("4/dpxb3iT4tp/ZCVEwSnEsLxx0bqyhLpdfOpc6fn7OR8+UClSV5n9E6aSS8MPtnRfp32bAb0nmbRn6H8ndwLUQ==")
  })
})

describe("Binance assets", () => {
  it("folds Simple Earn positions into the coin", () => {
    expect(normalizeBinanceAsset("LDBTC")).toBe("BTC")
    expect(normalizeBinanceAsset("LDUSDT")).toBe("USDT")
    expect(normalizeBinanceAsset("LDO")).toBe("LDO")
  })
})

describe("Coinbase JWT", () => {
  it("signs ES256 with a SEC1 EC key", async () => {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey))
    // PKCS#8 for P-256 is SEQUENCE { version, AlgorithmIdentifier (27 bytes in), OCTET STRING { SEC1 ECPrivateKey } }.
    expect(pkcs8[27]).toBe(0x04)
    const ecPrivateKey = pkcs8.slice(29, 29 + pkcs8[28]!)
    const pem = `-----BEGIN EC PRIVATE KEY-----\n${toBase64(ecPrivateKey)}\n-----END EC PRIVATE KEY-----`
    const jwt = await coinbaseJwt({ key: "organizations/o/apiKeys/k", secret: pem }, "GET", "/v2/accounts", 1_800_000_000)
    const [header, payload, signature] = jwt.split(".")
    const decode = (part: string) => JSON.parse(new TextDecoder().decode(fromBase64Url(part)))
    expect(decode(header!)).toMatchObject({ alg: "ES256", kid: "organizations/o/apiKeys/k", typ: "JWT" })
    expect(decode(payload!)).toEqual({
      sub: "organizations/o/apiKeys/k",
      iss: "cdp",
      nbf: 1_800_000_000,
      exp: 1_800_000_120,
      uri: "GET api.coinbase.com/v2/accounts",
    })
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pair.publicKey,
      fromBase64Url(signature!),
      utf8(`${header}.${payload}`),
    )
    expect(valid).toBe(true)
  })

  it("signs EdDSA with a base64 Ed25519 secret", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey))
    const seed = pkcs8.slice(-32)
    const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))
    const secret = toBase64(new Uint8Array([...seed, ...publicRaw]))
    const jwt = await coinbaseJwt({ key: "k", secret }, "GET", "/v2/accounts")
    const [header, payload, signature] = jwt.split(".")
    expect(JSON.parse(new TextDecoder().decode(fromBase64Url(header!))).alg).toBe("EdDSA")
    expect(await crypto.subtle.verify({ name: "Ed25519" }, pair.publicKey, fromBase64Url(signature!), utf8(`${header}.${payload}`))).toBe(true)
    expect(fromBase64(secret)).toHaveLength(64)
  })
})
