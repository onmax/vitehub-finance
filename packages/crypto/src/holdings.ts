import type { Holding } from "./model.ts"

export interface HoldingEntry {
  symbol: string
  quantity: number
  name?: string | null
  staked?: boolean
}

/** Adds up quantities per symbol and drops zeros: an exchange lists the staked and the spot part of one coin apart. */
export function mergeHoldings(entries: HoldingEntry[]): Holding[] {
  const merged = new Map<string, Holding>()
  for (const entry of entries) {
    if (!entry.symbol || !Number.isFinite(entry.quantity)) continue
    const current = merged.get(entry.symbol) ?? { symbol: entry.symbol, name: entry.name ?? null, quantity: 0, staked: 0 }
    current.quantity += entry.quantity
    if (entry.staked) current.staked += entry.quantity
    current.name ??= entry.name ?? null
    merged.set(entry.symbol, current)
  }
  return [...merged.values()].filter((holding) => Math.abs(holding.quantity) > 1e-12)
}

/** Base units (sats, wei, lamports, drops, luna) to coins, through BigInt so 18-decimal wei keeps its precision. */
export function fromBaseUnits(units: bigint, decimals: number) {
  const scale = 10n ** BigInt(decimals)
  return Number(units / scale) + Number(units % scale) / Number(scale)
}
