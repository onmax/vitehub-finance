import { defineHandler } from "h3"
import type { ProviderInfo } from "#shared/api"
import { BANK_PROVIDERS, EXCHANGE_PROVIDERS, WALLET_PROVIDERS } from "../../providers/index"
import { bankConfig } from "../../utils/connections"
import { requireMember } from "../../utils/identity"

/** What can be connected here. Banks need Enable Banking's app id and key; exchanges and wallets need nothing. */
export default defineHandler(async (event): Promise<ProviderInfo[]> => {
  await requireMember(event)
  const banks = Boolean(bankConfig())
  return [
    ...BANK_PROVIDERS.map((id) => ({ id, available: banks })),
    ...[...EXCHANGE_PROVIDERS, ...WALLET_PROVIDERS].map((id) => ({ id, available: true })),
  ]
})
