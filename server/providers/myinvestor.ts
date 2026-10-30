// MyInvestor through @vitehub-finance/brokers: one `investment` account holding the funds, ETFs, and pension plans the
// person said they hold, each at Morningstar's latest NAV. Its current account syncs as a bank (Enable Banking).
import { BrokerError, morningstar, myinvestor, type MyInvestorCredentials } from "@vitehub-finance/brokers"
import { brokerHoldings } from "./ibkr"
import { mapped, ProviderError, USER_AGENT, type ProviderResult } from "./types"

export type { MyInvestorCredentials }

const NO_FUND_PRICE = "Morningstar has no recent price for one of your MyInvestor funds. Remove it and connect MyInvestor again."

/** Funds by ISIN or name, for the connect dialog. */
export const searchFunds = (term: string) => mapped(() => morningstar({ userAgent: USER_AGENT }).search(term))

export async function myinvestorProvider(credentials: MyInvestorCredentials): Promise<ProviderResult> {
  return mapped(async () => {
    const accounts = await myinvestor(credentials, { userAgent: USER_AGENT })
      .accounts()
      .catch((error) => {
        // The package names the fund in English; the app shows a message it can translate.
        throw error instanceof BrokerError && error.code === "invalid_credentials" ? new ProviderError("auth", NO_FUND_PRICE) : error
      })
    return {
      accounts: accounts.map((account) => ({
        externalId: account.id,
        name: "MyInvestor",
        kind: "investment" as const,
        currency: "EUR",
        institution: "MyInvestor",
        holdings: brokerHoldings(account),
      })),
    }
  })
}
