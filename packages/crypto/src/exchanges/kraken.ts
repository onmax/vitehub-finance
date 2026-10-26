import { CryptoError } from "../errors.ts"
import { mergeHoldings } from "../holdings.ts"
import { readBody, requester, type ClientOptions } from "../http.ts"
import type { CryptoProvider, ExchangeCredentials } from "../model.ts"
import { fromBase64, hmac, sha256, toBase64, utf8 } from "../signing.ts"

// Kraken's legacy asset codes (from before it used plain tickers), plus renamed ones.
const ALIASES: Record<string, string> = {
  XXBT: "BTC",
  XBT: "BTC",
  XETH: "ETH",
  XXRP: "XRP",
  XXLM: "XLM",
  XLTC: "LTC",
  XXMR: "XMR",
  XZEC: "ZEC",
  XETC: "ETC",
  XMLN: "MLN",
  XREP: "REP",
  XXDG: "DOGE",
  XDG: "DOGE",
  ZEUR: "EUR",
  ZUSD: "USD",
  ZGBP: "GBP",
  ZCAD: "CAD",
  ZJPY: "JPY",
  ZAUD: "AUD",
  ZCHF: "CHF",
  ETH2: "ETH",
}

// Four-letter tickers that start with X or Z but aren't legacy codes, so they keep their first letter.
const KEEP = new Set(["ZETA", "ZEUS", "ZERO", "XCAD", "XCHF", "ZRX", "XTZ"])
// Staked (.S), bonded (.B), opt-in rewards (.F), and parachain (.P) balances earn rewards; margin (.M) doesn't.
const STAKED = /\.(S|B|F|P)$/

/** `XXBT` → BTC, `ZEUR` → EUR, `DOT.S` → DOT, `ETH2.S` → ETH, `USDC.M` → USDC. */
export function normalizeKrakenAsset(code: string) {
  let symbol = code.toUpperCase().trim()
  const suffixed = /\.(S|F|B|M|P|HOLD)$/.test(symbol)
  symbol = symbol.replace(/\.(S|F|B|M|P|HOLD)$/, "")
  // Bonded staking variants carry a lock period (DOT28.S, KSM07.S); plain tickers like API3 keep their digits.
  if (suffixed) symbol = symbol.replace(/^([A-Z]{2,})\d+$/, (whole, coin: string) => (whole === "ETH2" ? whole : coin))
  const alias = ALIASES[symbol]
  if (alias) return alias
  if (symbol.length === 4 && /^[XZ]/.test(symbol) && !KEEP.has(symbol)) {
    const stripped = symbol.slice(1)
    return ALIASES[stripped] ?? stripped
  }
  return symbol
}

export async function krakenSignature(path: string, nonce: string, postData: string, secret: string) {
  const message = new Uint8Array([...utf8(path), ...(await sha256(nonce + postData))])
  return toBase64(await hmac("SHA-512", fromBase64(secret), message))
}

let lastNonce = 0

/** Kraken with a key that may only query funds. */
export function kraken(credentials: ExchangeCredentials, options: ClientOptions = {}): CryptoProvider {
  const request = requester("kraken", "Kraken", options)
  const fail = (code: ConstructorParameters<typeof CryptoError>[0], message: string) => new CryptoError(code, message, "kraken")
  return {
    id: "kraken",
    name: "Kraken",
    kind: "exchange",
    address: null,
    async balances() {
      const path = "/0/private/Balance"
      // Kraken wants a strictly increasing nonce per key.
      lastNonce = Math.max(Date.now() * 1000, lastNonce + 1)
      const nonce = String(lastNonce)
      const postData = `nonce=${nonce}`
      let signature: string
      try {
        signature = await krakenSignature(path, nonce, postData, credentials.secret)
      } catch {
        throw fail("invalid_credentials", "Kraken: the private key isn't valid base64. Copy it again from Kraken's API settings.")
      }
      const response = await request(`https://api.kraken.com${path}`, {
        method: "POST",
        headers: { "API-Key": credentials.key, "API-Sign": signature, "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
        body: postData,
      })
      const body = (await readBody(response)) as { error?: string[]; result?: Record<string, string> } | string
      const errors = typeof body === "object" ? (body.error ?? []) : []
      if (errors.length) {
        const message = errors.join(", ")
        if (/EAPI:Invalid (key|signature|nonce)|Permission denied|EGeneral:Permission/i.test(message))
          throw fail("invalid_credentials", `Kraken rejected the key: ${message}`)
        if (/Rate limit|Throttled/i.test(message)) throw fail("rate_limited", `Kraken: ${message}`)
        throw fail("unavailable", `Kraken: ${message}`)
      }
      if (!response.ok || typeof body !== "object" || !body.result) throw fail("unavailable", `Kraken answered ${response.status}.`)
      return mergeHoldings(
        Object.entries(body.result).map(([code, amount]) => ({
          symbol: normalizeKrakenAsset(code),
          quantity: Number(amount),
          staked: STAKED.test(code.toUpperCase()),
        })),
      )
    },
  }
}
