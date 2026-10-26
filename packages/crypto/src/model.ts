// The one data model every provider answers in: what a place holds, coin by coin.

export type ExchangeId = "kraken" | "binance" | "coinbase"
export type ChainId = "bitcoin" | "ethereum" | "solana" | "xrpl" | "nimiq"
export type CryptoProviderId = ExchangeId | ChainId | "fake"

export interface Holding {
  /** The ticker, uppercase: BTC, ETH, NIM. Exchanges' own codes (XXBT, LDUSDT) are normalized. */
  symbol: string
  /** The coin's name when the provider says it. */
  name: string | null
  /** Everything held, staked included, in whole coins. */
  quantity: number
  /** The part of `quantity` that is staked or locked earning rewards. */
  staked: number
}

export interface CryptoProvider {
  readonly id: CryptoProviderId
  /** For people: "Kraken", "Nimiq". */
  readonly name: string
  readonly kind: "exchange" | "wallet"
  /** The address a wallet watches, normalized; null for exchanges. */
  readonly address: string | null
  /** What it holds now, one entry per coin, zero balances left out. */
  balances(): Promise<Holding[]>
}

/** A read-only API key. Coinbase's `key` is the key name (organizations/…/apiKeys/…) and `secret` its private key. */
export interface ExchangeCredentials {
  key: string
  secret: string
}
