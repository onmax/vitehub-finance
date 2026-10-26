import { CryptoError } from "./errors.ts"
import type { CryptoProvider, Holding } from "./model.ts"

export type BalancesResult = { provider: CryptoProvider; holdings: Holding[]; error: null } | { provider: CryptoProvider; holdings: null; error: CryptoError }

export interface CryptoClient {
  readonly providers: readonly CryptoProvider[]
  /** Every provider's holdings at once. One failing never hides the others: its entry carries the error. */
  balances(): Promise<BalancesResult[]>
  /** All holdings added up per coin, and the providers that failed. */
  totals(): Promise<{ holdings: Holding[]; failed: BalancesResult[] }>
}

/** Several exchanges and wallets behind one client. */
export function createCrypto(providers: CryptoProvider[]): CryptoClient {
  async function balances() {
    const settled = await Promise.allSettled(providers.map((provider) => provider.balances()))
    return settled.map((outcome, index): BalancesResult => {
      const provider = providers[index]!
      if (outcome.status === "fulfilled") return { provider, holdings: outcome.value, error: null }
      const error =
        outcome.reason instanceof CryptoError
          ? outcome.reason
          : new CryptoError("unavailable", outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason), provider.id)
      return { provider, holdings: null, error }
    })
  }
  return {
    providers,
    balances,
    async totals() {
      const results = await balances()
      const merged = new Map<string, Holding>()
      for (const result of results)
        for (const holding of result.holdings ?? []) {
          const current = merged.get(holding.symbol) ?? { ...holding, quantity: 0, staked: 0 }
          current.quantity += holding.quantity
          current.staked += holding.staked
          merged.set(holding.symbol, current)
        }
      return { holdings: [...merged.values()], failed: results.filter((result) => result.error) }
    },
  }
}
