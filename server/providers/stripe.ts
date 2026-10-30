import { isStripeTransfer, stripe, type PaymentMovement } from "@vitehub-finance/payments"
import { mapped, USER_AGENT, type FetchOptions, type ProviderAccount, type ProviderResult, type ProviderTransaction } from "./types"

export interface StripeCredentials {
  key: string
  accountId: string
}

function stripeTransaction(row: PaymentMovement): ProviderTransaction {
  return {
    externalId: row.id,
    dedupeKey: `stripe:${row.id}`,
    date: new Date(row.created * 1000).toISOString().slice(0, 10),
    amountMinor: row.netMinor,
    currency: row.currency,
    description: `Stripe ${row.reportingCategory.replaceAll("_", " ")}`,
    transfer: isStripeTransfer(row),
    payment: {
      grossMinor: row.grossMinor,
      feeMinor: row.feeMinor,
      netMinor: row.netMinor,
      status: row.status,
      availableOn: new Date(row.availableOn * 1000).toISOString(),
      type: row.type,
      reportingCategory: row.reportingCategory,
      sourceId: row.sourceId,
    },
  }
}

export async function stripeProvider(credentials: StripeCredentials, options: FetchOptions): Promise<ProviderResult> {
  return mapped(async () => {
    const result = await stripe(credentials, { userAgent: USER_AGENT }).read({
      since: options.initial ? null : options.since,
      pendingIds: options.pendingPaymentIds,
    })
    const accounts = new Map<string, ProviderAccount>()
    const balances = new Map(result.balances.map((balance) => [balance.currency, balance]))
    for (const currency of options.paymentCurrencies ?? [])
      if (!balances.has(currency)) balances.set(currency, { currency, availableMinor: 0, pendingMinor: 0 })
    for (const balance of balances.values()) {
      accounts.set(balance.currency, {
        externalId: `${credentials.accountId}:${balance.currency}`,
        name: `Stripe ${balance.currency}`,
        kind: "other",
        institution: "Stripe",
        currency: balance.currency,
        balanceMinor: balance.availableMinor + balance.pendingMinor,
        paymentBalance: { availableMinor: balance.availableMinor, pendingMinor: balance.pendingMinor },
        transactions: [],
      })
    }
    for (const movement of result.movements) {
      let account = accounts.get(movement.currency)
      // A previously used currency can disappear from the current balance response after payout.
      if (!account) {
        account = {
          externalId: `${credentials.accountId}:${movement.currency}`,
          name: `Stripe ${movement.currency}`,
          kind: "other",
          institution: "Stripe",
          currency: movement.currency,
          balanceMinor: 0,
          paymentBalance: { availableMinor: 0, pendingMinor: 0 },
          transactions: [],
        }
        accounts.set(movement.currency, account)
      }
      account.transactions?.push(stripeTransaction(movement))
    }
    return { accounts: [...accounts.values()] }
  })
}
