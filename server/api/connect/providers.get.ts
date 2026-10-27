import { defineHandler } from "h3"
import type { ProviderInfo } from "#shared/api"
import { BANK_PROVIDERS, BROKER_PROVIDERS, EXCHANGE_PROVIDERS, WALLET_PROVIDERS } from "../../providers/index"
import { banksUnavailable } from "../../utils/connections"
import { requireMember } from "../../utils/identity"

/**
 * What can be connected here. Banks need Enable Banking's app id and key, and no public instance offers them;
 * exchanges, wallets, and brokers need nothing.
 */
export default defineHandler(async (event): Promise<ProviderInfo[]> => {
  await requireMember(event)
  const banks = banksUnavailable()
  return [
    ...BANK_PROVIDERS.map((id) => (banks ? { id, available: false, reason: banks } : { id, available: true })),
    ...[...EXCHANGE_PROVIDERS, ...WALLET_PROVIDERS, ...BROKER_PROVIDERS].map((id) => ({ id, available: true })),
  ]
})
