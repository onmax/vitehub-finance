// Which code fetches which connection. Kept free of ViteHub imports: the caller passes the configuration in.
import type { ProviderId } from "../../shared/api"
import { enableBanking, type EnableBankingConfig } from "./enable-banking"
import { EXCHANGES } from "./exchanges"
import { ProviderError, type Provider } from "./types"
import { wallet } from "./wallets"

export const BANK_PROVIDERS = ["enable_banking"] as const
export const EXCHANGE_PROVIDERS = ["kraken", "binance", "coinbase"] as const
export const WALLET_PROVIDERS = ["bitcoin", "ethereum", "solana", "xrpl"] as const

export function providerFor(id: ProviderId, config: { enableBanking: EnableBankingConfig | null }): Provider<any> {
  switch (id) {
    case "enable_banking":
      if (!config.enableBanking)
        throw new ProviderError("auth", "Bank sync isn't configured: set ENABLE_BANKING_APP_ID and ENABLE_BANKING_PRIVATE_KEY.")
      return enableBanking(config.enableBanking)
    case "kraken":
    case "binance":
    case "coinbase":
      return EXCHANGES[id]
    case "bitcoin":
    case "ethereum":
    case "solana":
    case "xrpl":
      return wallet(id)
    case "manual":
      throw new ProviderError("auth", "Manual accounts have nothing to sync.")
  }
}
