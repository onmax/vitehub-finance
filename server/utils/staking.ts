// A crypto account's staking: what the provider read (server/providers/crypto.ts), stored as it came, and the summary
// the account page and agents read. Nothing here sets a balance: the holdings already count every staked coin, and
// rewards sit inside them. Values in money are today's price for the coins, not what they were worth when they arrived.
import { asc, eq } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import { formatUnits, summarizeStaking, type StakingEventKind, type StakingLedger } from "@vitehub-finance/crypto"
import { currencyDigits } from "#shared/money"
import type { StakingView } from "#shared/api"
import { stakingEvent, stakingPosition } from "../databases/config"
import { quotes } from "./prices"

// D1 binds at most 100 parameters per statement: an event binds 7.
const EVENT_CHUNK = 14
/** The newest events the account page lists; the totals count all of them. */
const LISTED_EVENTS = 200

/**
 * Replaces an account's staking with a fresh, complete read. The ledger is summarized first, so two events with one id
 * (one source contradicting itself) fail before anything is written, and duplicates are written once.
 */
export async function saveStaking(accountId: string, ledger: StakingLedger) {
  const { events } = summarizeStaking(ledger)
  const { position } = ledger
  const row = {
    chain: ledger.asset.chain,
    symbol: ledger.asset.symbol,
    decimals: ledger.asset.decimals,
    validator: position.validator,
    validatorListed: ledger.validatorListed,
    liquid: String(position.liquid),
    active: String(position.active),
    inactive: String(position.inactive),
    retired: String(position.retired),
    observedAt: position.observedAt,
    coverageFrom: ledger.from,
    coverageTo: ledger.to,
    notes: JSON.stringify(ledger.notes),
  }
  await db.insert(stakingPosition).values({ accountId, ...row }).onConflictDoUpdate({ target: stakingPosition.accountId, set: row })
  await db.delete(stakingEvent).where(eq(stakingEvent.accountId, accountId))
  const values = events.map((event) => ({ accountId, id: event.id, at: event.at, kind: event.kind, atoms: String(event.atoms), counterparty: event.counterparty, evidence: event.evidence }))
  for (let index = 0; index < values.length; index += EVENT_CHUNK) await db.insert(stakingEvent).values(values.slice(index, index + EVENT_CHUNK))
}

/**
 * An account's staking for people and agents, or null when it has none. Amounts are exact decimal strings of coins;
 * `values` are the same amounts at today's price in `currency` (minor units), null when no price is known.
 */
export async function stakingView(accountId: string, currency: string): Promise<StakingView | null> {
  const [position] = await db.select().from(stakingPosition).where(eq(stakingPosition.accountId, accountId)).limit(1)
  if (!position) return null
  const rows = await db.select().from(stakingEvent).where(eq(stakingEvent.accountId, accountId)).orderBy(asc(stakingEvent.at))
  const ledger: StakingLedger = {
    asset: { chain: position.chain, symbol: position.symbol, decimals: position.decimals },
    address: "",
    from: position.coverageFrom,
    to: position.coverageTo,
    position: {
      liquid: BigInt(position.liquid),
      active: BigInt(position.active),
      inactive: BigInt(position.inactive),
      retired: BigInt(position.retired),
      validator: position.validator,
      observedAt: position.observedAt,
    },
    events: rows.map((row) => ({ id: row.id, at: row.at, kind: row.kind as StakingEventKind, atoms: BigInt(row.atoms), counterparty: row.counterparty, evidence: row.evidence })),
    validatorListed: position.validatorListed,
    notes: JSON.parse(position.notes) as string[],
  }
  const summary = summarizeStaking(ledger)
  const coins = (atoms: bigint) => formatUnits(atoms, position.decimals)
  const price = (await quotes([position.symbol], currency))[position.symbol.toUpperCase()] ?? null
  const scale = 10 ** currencyDigits(currency)
  // Coins times today's price, in minor units. Display only: the exact amounts stay the strings above.
  const value = (atoms: bigint) => (price === null ? null : Math.round(Number(coins(atoms)) * price * scale))
  const totals = Object.entries(summary.totals) as Array<[keyof typeof summary.totals, bigint]>
  return {
    chain: position.chain,
    symbol: position.symbol,
    validator: position.validator,
    validatorListed: position.validatorListed,
    observedAt: position.observedAt,
    coverage: { from: position.coverageFrom, to: position.coverageTo },
    amounts: Object.fromEntries(totals.map(([key, atoms]) => [key, coins(atoms)])) as StakingView["amounts"],
    values: price === null ? null : (Object.fromEntries(totals.map(([key, atoms]) => [key, value(atoms)])) as StakingView["values"]),
    price: price === null ? null : { perUnit: price, currency },
    monthly: summary.monthly.map((month) => ({
      month: month.month,
      paid: coins(month.paid),
      restaked: coins(month.restaked),
      total: coins(month.paid + month.restaked),
      valueMinor: value(month.paid + month.restaked),
    })),
    senders: summary.senders.map((sender) => ({ address: sender.address, amount: coins(sender.atoms) })),
    events: summary.events
      .slice(-LISTED_EVENTS)
      .reverse()
      .map((event) => ({ id: event.id, at: event.at, kind: event.kind, amount: coins(event.atoms), counterparty: event.counterparty, evidence: event.evidence })),
    eventCount: summary.events.length,
    unknown: summary.unknown,
    notes: ledger.notes,
  }
}
