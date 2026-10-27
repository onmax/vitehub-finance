// The one data model every provider answers in: what a place holds, coin by coin, and for wallets what moved.

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
  /** What moved in and out of the address, newest first. Only wallets on chains with a public history have it. */
  transactions?(options?: TransactionsOptions): Promise<CryptoTransaction[]>
}

export interface TransactionsOptions {
  /** `YYYY-MM-DD`: leave out what happened before this day. */
  since?: string | null
}

/**
 * `send` and `receive` move coins to or from another address, `reward` is new coins from block production or staking,
 * `stake` moves the address's own coins into staking or back (its holding counts both, so its total doesn't change),
 * `trade` swaps the coin for another asset on the chain (the XRP Ledger's DEX and AMMs), `escrow` locks the address's
 * own coins in an XRP Ledger escrow or brings them back (the balance leaves locked coins out, so it changes), and `fee`
 * is a transaction that cost the address its fee and moved nothing else: a setting, a trust line, a failed (`tec*`) one.
 */
export type CryptoTransactionKind = "send" | "receive" | "reward" | "stake" | "trade" | "escrow" | "fee"

export interface CryptoTransaction {
  /** The transaction hash. */
  id: string
  /** `YYYY-MM-DD`, UTC. */
  date: string
  /** The native coin's ticker: XRP, NIM, BTC. */
  symbol: string
  /** Whole coins, signed: negative left the address. The fee is apart. */
  quantity: number
  /** Whole coins of the same coin this address paid the network; 0 when another address paid. */
  fee: number
  /** The other address, when there is one. */
  counterparty: string | null
  kind: CryptoTransactionKind
}

/** A read-only API key. Coinbase's `key` is the key name (organizations/…/apiKeys/…) and `secret` its private key. */
export interface ExchangeCredentials {
  key: string
  secret: string
}
