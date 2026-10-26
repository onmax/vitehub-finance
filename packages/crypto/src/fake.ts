import { CryptoError, type CryptoErrorCode } from "./errors.ts"
import type { CryptoProvider, Holding } from "./model.ts"

/** A provider that answers what you give it, or fails with `fail`: for tests and demos. */
export function fake(input: { name?: string; kind?: "exchange" | "wallet"; holdings?: Array<Partial<Holding> & { symbol: string; quantity: number }>; fail?: CryptoErrorCode }): CryptoProvider {
  return {
    id: "fake",
    name: input.name ?? "Fake",
    kind: input.kind ?? "exchange",
    address: null,
    async balances() {
      if (input.fail) throw new CryptoError(input.fail, `Fake provider failed with ${input.fail}.`, "fake")
      return (input.holdings ?? []).map((holding) => ({ name: null, staked: 0, ...holding }))
    },
  }
}
