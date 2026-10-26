import { BrokerError, type BrokerErrorCode } from "./errors.ts"
import type { BrokerAccount, BrokerProvider } from "./model.ts"

/** A broker that answers what you give it, or fails with `fail`: for tests and demos. */
export function fake(input: { name?: string; accounts?: BrokerAccount[]; fail?: BrokerErrorCode }): BrokerProvider {
  return {
    id: "fake",
    name: input.name ?? "Fake broker",
    async accounts() {
      if (input.fail) throw new BrokerError(input.fail, `Fake broker failed with ${input.fail}.`, "fake")
      return input.accounts ?? []
    },
  }
}
