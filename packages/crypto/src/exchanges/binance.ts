import { CryptoError } from "../errors.ts"
import { mergeHoldings } from "../holdings.ts"
import { describeBody, readBody, requester, type ClientOptions } from "../http.ts"
import type { CryptoProvider, ExchangeCredentials } from "../model.ts"
import { hmac, toHex, utf8 } from "../signing.ts"

/** Binance lists Simple Earn positions as `LD<coin>`; they are still the coin. */
export function normalizeBinanceAsset(code: string) {
  const symbol = code.toUpperCase()
  return symbol.startsWith("LD") && symbol.length >= 5 ? symbol.slice(2) : symbol
}

/** Binance spot and Simple Earn, with a read-only key. */
export function binance(credentials: ExchangeCredentials, options: ClientOptions = {}): CryptoProvider {
  const request = requester("binance", "Binance", options)
  const fail = (code: ConstructorParameters<typeof CryptoError>[0], message: string) => new CryptoError(code, message, "binance")
  return {
    id: "binance",
    name: "Binance",
    kind: "exchange",
    address: null,
    async balances() {
      const query = `omitZeroBalances=true&recvWindow=10000&timestamp=${Date.now()}`
      const signature = toHex(await hmac("SHA-256", utf8(credentials.secret), query))
      const response = await request(`https://api.binance.com/api/v3/account?${query}&signature=${signature}`, {
        headers: { "X-MBX-APIKEY": credentials.key },
      })
      const body = (await readBody(response)) as { balances?: Array<{ asset: string; free: string; locked: string }>; code?: number }
      if (!response.ok) {
        const message = describeBody(body, `Binance answered ${response.status}.`)
        if (response.status === 401 || [-2014, -2015, -1022, -2008].includes(Number(body?.code)))
          throw fail("invalid_credentials", `Binance rejected the key: ${message}`)
        if (response.status === 429 || response.status === 418) throw fail("rate_limited", `Binance: ${message}`)
        if (response.status === 451) throw fail("unavailable", "Binance refuses requests from this server's region.")
        throw fail("unavailable", `Binance: ${message}`)
      }
      return mergeHoldings(
        (body.balances ?? []).map((balance) => ({
          symbol: normalizeBinanceAsset(balance.asset),
          quantity: Number(balance.free) + Number(balance.locked),
          staked: balance.asset.toUpperCase().startsWith("LD") && balance.asset.length >= 5,
        })),
      )
    },
  }
}
