import { binance } from "./exchanges/binance.ts"
import { coinbase } from "./exchanges/coinbase.ts"
import { kraken } from "./exchanges/kraken.ts"
import type { ClientOptions } from "./http.ts"
import type { ChainId, CryptoProvider, ExchangeCredentials, ExchangeId } from "./model.ts"
import { CHAINS } from "./wallets/chains.ts"
import { wallet, type WalletOptions } from "./wallets/index.ts"

export const EXCHANGES: Record<ExchangeId, { name: string; keyHelp: string }> = {
  kraken: { name: "Kraken", keyHelp: "A key with only “Query Funds”." },
  binance: { name: "Binance", keyHelp: "A key with only “Enable Reading”." },
  coinbase: { name: "Coinbase", keyHelp: "A CDP key with only “View”. The key name and its private key." },
}

export const EXCHANGE_IDS = ["kraken", "binance", "coinbase"] as const satisfies readonly ExchangeId[]
export const CHAIN_IDS = ["bitcoin", "ethereum", "polygon", "solana", "xrpl", "nimiq"] as const satisfies readonly ChainId[]

export const isExchange = (id: string): id is ExchangeId => id in EXCHANGES
export const isChain = (id: string): id is ChainId => id in CHAINS

const FACTORIES: Record<ExchangeId, (credentials: ExchangeCredentials, options?: ClientOptions) => CryptoProvider> = { kraken, binance, coinbase }

/** A provider from its id and what it needs: an exchange's key, or a wallet's address. */
export function connect(id: ExchangeId, credentials: ExchangeCredentials, options?: ClientOptions): CryptoProvider
export function connect(id: ChainId, credentials: { address: string }, options?: WalletOptions): CryptoProvider
export function connect(id: ExchangeId | ChainId, credentials: ExchangeCredentials | { address: string }, options: WalletOptions = {}) {
  if (isExchange(id)) return FACTORIES[id](credentials as ExchangeCredentials, options)
  return wallet(id, (credentials as { address: string }).address, options)
}
