// Which code fetches which connection. Kept free of ViteHub imports: the caller passes the configuration in.
import { CHAIN_IDS, EXCHANGE_IDS } from "@vitehub-finance/crypto"
import type { ProviderId } from "../../shared/api"
import { cryptoProvider } from "./crypto"
import { enableBanking, type EnableBankingConfig } from "./enable-banking"
import { ibkrProvider } from "./ibkr"
import { myinvestorProvider } from "./myinvestor"
import { stripeProvider } from "./stripe"
import { ProviderError, type Provider } from "./types"

export const BANK_PROVIDERS = ["enable_banking"] as const
export const EXCHANGE_PROVIDERS = EXCHANGE_IDS
export const WALLET_PROVIDERS = CHAIN_IDS
export const BROKER_PROVIDERS = ["ibkr", "myinvestor"] as const
export const PAYMENT_PROVIDERS = ["stripe"] as const

export function providerFor(id: ProviderId, config: { enableBanking: EnableBankingConfig | null }): Provider<any> {
  switch (id) {
    case "enable_banking":
      if (!config.enableBanking)
        throw new ProviderError("auth", "Bank connections aren't set up on this server. Set ENABLE_BANKING_APP_ID and ENABLE_BANKING_PRIVATE_KEY, then restart.")
      return enableBanking(config.enableBanking)
    case "ibkr":
      return ibkrProvider
    case "myinvestor":
      return myinvestorProvider
    case "stripe":
      return stripeProvider
    case "manual":
      throw new ProviderError("auth", "Manual accounts have nothing to sync.")
    default:
      return cryptoProvider(id)
  }
}
