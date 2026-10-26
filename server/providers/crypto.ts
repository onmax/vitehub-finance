// Exchanges and wallets through @vitehub-finance/crypto: one `crypto` account per connection, its coins as holdings.
import { connect, type ChainId, type ExchangeCredentials, type ExchangeId } from "@vitehub-finance/crypto"
import { mapped, USER_AGENT, type ProviderResult } from "./types"

export interface WalletCredentials {
  address: string
}

/** Reads one exchange or wallet. Holdings are priced later, in the household's currency (server/utils/prices.ts). */
export function cryptoProvider(id: ExchangeId | ChainId) {
  return async (credentials: ExchangeCredentials | WalletCredentials): Promise<ProviderResult> =>
    mapped(async () => {
      const provider = connect(id as ChainId, credentials as WalletCredentials, { userAgent: USER_AGENT })
      const holdings = await provider.balances()
      return {
        accounts: [
          {
            externalId: provider.address ?? "main",
            name: provider.kind === "wallet" ? `${provider.name} wallet` : provider.name,
            kind: "crypto",
            currency: "EUR",
            institution: provider.name,
            holdings: holdings.map(({ symbol, name, quantity }) => ({ symbol, name, quantity })),
          },
        ],
      }
    })
}
