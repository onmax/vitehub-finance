import { CryptoError } from "../errors.ts"
import { mergeHoldings, type HoldingEntry } from "../holdings.ts"
import { describeBody, readBody, requester, type ClientOptions } from "../http.ts"
import type { CryptoProvider, ExchangeCredentials } from "../model.ts"
import { importCdpKey, randomHex, signJwt } from "../signing.ts"

/**
 * A Coinbase CDP key's JWT, bound to one request (method, host, path) and valid for two minutes. `key` is the key name,
 * `secret` the EC private key PEM or a base64 Ed25519 secret.
 */
export async function coinbaseJwt(credentials: ExchangeCredentials, method: string, path: string, now = Math.floor(Date.now() / 1000)) {
  let signing
  try {
    signing = await importCdpKey(credentials.secret)
  } catch (error) {
    throw new CryptoError("invalid_credentials", `Coinbase: the private key couldn't be read (${error instanceof Error ? error.message : error}).`, "coinbase")
  }
  return signJwt(
    { kid: credentials.key, nonce: randomHex(16), typ: "JWT" },
    { sub: credentials.key, iss: "cdp", nbf: now, exp: now + 120, uri: `${method} api.coinbase.com${path}` },
    signing,
  )
}

interface CoinbaseAccount {
  currency?: { code?: string; name?: string } | string
  balance?: { amount?: string; currency?: string }
}

/** Coinbase (Advanced / CDP API keys with view permission). */
export function coinbase(credentials: ExchangeCredentials, options: ClientOptions = {}): CryptoProvider {
  const request = requester("coinbase", "Coinbase", options)
  const fail = (code: ConstructorParameters<typeof CryptoError>[0], message: string) => new CryptoError(code, message, "coinbase")
  return {
    id: "coinbase",
    name: "Coinbase",
    kind: "exchange",
    address: null,
    async balances() {
      const entries: HoldingEntry[] = []
      let next: string | null = "/v2/accounts?limit=100"
      for (let page = 0; next && page < 20; page++) {
        const path: string = next.split("?")[0]!
        const response = await request(`https://api.coinbase.com${next}`, {
          headers: { authorization: `Bearer ${await coinbaseJwt(credentials, "GET", path)}`, "CB-VERSION": "2024-01-01" },
        })
        const body = (await readBody(response)) as {
          data?: CoinbaseAccount[]
          pagination?: { next_uri?: string | null }
          errors?: Array<{ message?: string }>
        }
        if (!response.ok) {
          const message = body?.errors?.[0]?.message ?? describeBody(body, `Coinbase answered ${response.status}.`)
          if (response.status === 401 || response.status === 403) throw fail("invalid_credentials", `Coinbase rejected the key: ${message}`)
          if (response.status === 429) throw fail("rate_limited", `Coinbase: ${message}`)
          throw fail("unavailable", `Coinbase: ${message}`)
        }
        for (const account of body.data ?? []) {
          const code = typeof account.currency === "string" ? account.currency : account.currency?.code
          const name = typeof account.currency === "string" ? null : account.currency?.name
          entries.push({ symbol: (account.balance?.currency || code || "").toUpperCase(), name, quantity: Number(account.balance?.amount ?? 0) })
        }
        next = body.pagination?.next_uri || null
      }
      return mergeHoldings(entries)
    },
  }
}
