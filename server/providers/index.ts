// Which code fetches which connection. Kept free of ViteHub imports: the caller passes the configuration in.
import { CHAIN_IDS, EXCHANGE_IDS } from "@vitehub-finance/crypto"
import type { ProviderId } from "../../shared/api"
import { cryptoProvider } from "./crypto"
import { enableBanking, type EnableBankingConfig } from "./enable-banking"
import { ProviderError, type Provider } from "./types"

export const BANK_PROVIDERS = ["enable_banking"] as const
export const EXCHANGE_PROVIDERS = EXCHANGE_IDS
export const WALLET_PROVIDERS = CHAIN_IDS

export function providerFor(id: ProviderId, config: { enableBanking: EnableBankingConfig | null }): Provider<any> {
  switch (id) {
    case "enable_banking":
      if (!config.enableBanking)
        throw new ProviderError("auth", "Bank sync isn't configured: set ENABLE_BANKING_APP_ID and ENABLE_BANKING_PRIVATE_KEY.")
      return enableBanking(config.enableBanking)
    case "manual":
      throw new ProviderError("auth", "Manual accounts have nothing to sync.")
    default:
      return cryptoProvider(id)
  }
}
