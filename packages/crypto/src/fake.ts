import { CryptoError, type CryptoErrorCode } from "./errors.ts"
import type { CryptoProvider, CryptoTransaction, Holding } from "./model.ts"

/** A provider that answers what you give it, or fails with `fail`: for tests and demos. */
export function fake(input: {
  name?: string
  kind?: "exchange" | "wallet"
  holdings?: Array<Partial<Holding> & { symbol: string; quantity: number }>
  /** Given, the provider has `transactions()` and answers these from `since` on. */
  transactions?: CryptoTransaction[]
  fail?: CryptoErrorCode
}): CryptoProvider {
  const { transactions } = input
  return {
    id: "fake",
    name: input.name ?? "Fake",
    kind: input.kind ?? "exchange",
    address: null,
    async balances() {
      if (input.fail) throw new CryptoError(input.fail, `Fake provider failed with ${input.fail}.`, "fake")
      return (input.holdings ?? []).map((holding) => ({ name: null, staked: 0, ...holding }))
    },
    ...(transactions && {
      async transactions(options) {
        if (input.fail) throw new CryptoError(input.fail, `Fake provider failed with ${input.fail}.`, "fake")
        return transactions.filter((transaction) => !options?.since || transaction.date >= options.since)
      },
    }),
  }
}
