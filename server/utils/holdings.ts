import { eq, isNull } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import { financialAccount, holding } from "../databases/config"
import type { ProviderHolding } from "../providers/types"
import { METALS, valueHoldings } from "./prices"
import { recordSnapshot } from "./snapshots"

// D1 binds at most 100 parameters per statement: a holding binds 7.
const HOLDING_CHUNK = 12

/** Swaps what an account holds for `holdings`, priced. */
export async function replaceHoldings(accountId: string, holdings: Array<ProviderHolding & { priceMinor: number | null; valueMinor: number }>) {
  await db.delete(holding).where(eq(holding.accountId, accountId))
  const values = holdings.map((entry) => ({
    id: crypto.randomUUID(),
    accountId,
    symbol: entry.symbol.toUpperCase(),
    name: entry.name ?? undefined,
    quantity: entry.quantity,
    priceMinor: entry.priceMinor ?? undefined,
    valueMinor: entry.valueMinor,
  }))
  for (let index = 0; index < values.length; index += HOLDING_CHUNK)
    await db.insert(holding).values(values.slice(index, index + HOLDING_CHUNK)).onConflictDoNothing()
}

const priced = (holdings: Array<{ symbol: string; quantity: number }>, currency: string) =>
  valueHoldings(
    holdings.filter((entry) => entry.quantity > 0).map((entry) => ({ ...entry, name: METALS[entry.symbol.toUpperCase()] ?? null })),
    currency,
  )

async function saveManual(accountId: string, holdings: Awaited<ReturnType<typeof priced>>) {
  await replaceHoldings(accountId, holdings)
  const balanceMinor = holdings.reduce((sum, entry) => sum + entry.valueMinor, 0)
  await db.update(financialAccount).set({ balanceMinor, balanceUpdatedAt: new Date() }).where(eq(financialAccount.id, accountId))
  await recordSnapshot(accountId, balanceMinor)
  return balanceMinor
}

/**
 * What a manual account holds, for assets no provider reports (silver bought in Revolut's app): the quantities its owner
 * types, at today's prices, and its balance as their sum. Zero quantities drop out. Returns the new balance.
 */
export async function setManualHoldings(account: { id: string; currency: string }, holdings: Array<{ symbol: string; quantity: number }>) {
  return saveManual(account.id, await priced(holdings, account.currency))
}

/**
 * Every manual account with holdings, at this morning's prices. An account with a holding nobody could price keeps
 * yesterday's value rather than dropping it to zero.
 */
export async function revalueManualHoldings() {
  const rows = await db
    .select({ accountId: holding.accountId, currency: financialAccount.currency, symbol: holding.symbol, quantity: holding.quantity })
    .from(holding)
    .innerJoin(financialAccount, eq(financialAccount.id, holding.accountId))
    .where(isNull(financialAccount.connectionId))
  const accounts = new Map<string, typeof rows>()
  for (const row of rows) accounts.set(row.accountId, [...(accounts.get(row.accountId) ?? []), row])
  let revalued = 0
  for (const [id, holdings] of accounts) {
    const today = await priced(holdings, holdings[0]!.currency)
    if (today.some((entry) => entry.priceMinor === null)) continue
    await saveManual(id, today)
    revalued++
  }
  return revalued
}
