// Staking accounting from public data, chain by chain: what an address holds liquid and staked now, and what moved in
// and out of staking. Amounts are integer base units (bigint), never floats, so a 32-million-coin stake and a reward of a
// few base units add up exactly. A chain's adapter normalizes its rewards, deposits, withdrawals, and fees into
// `StakingEvent`s; `summarizeStaking` adds them up the same way for every chain.
//
// What it never claims: identified rewards are a documented subset, not lifetime earnings. Deposits and withdrawals are
// gross (moving the same coins between validators counts twice), never earnings and never acquisition cost. Rewards
// already sit in the current balances (paid ones in the liquid balance, restaked ones in the stake), so they're history,
// not more money. Unpaid rewards, profit, and APY stay unknown: they need the validator's accrual data, the full capital
// history, what the coins cost, and historical prices.

export interface StakingAsset {
  chain: string
  /** The coin's ticker: NIM. */
  symbol: string
  /** Base units per coin, as a power of ten. */
  decimals: number
}

/** Balances read from the chain at `observedAt`, in base units. */
export interface StakingPosition {
  liquid: bigint
  /** Staked and earning. */
  active: bigint
  /** Being unstaked: no longer earning, not yet withdrawable. */
  inactive: bigint
  /** Unstaked for good after a validator was punished or retired; withdrawable. */
  retired: bigint
  /** The validator the stake is delegated to, when there is one. */
  validator: string | null
  /** ISO timestamp. */
  observedAt: string
}

/**
 * `reward_paid`: coins a known validator sent the address. `reward_restaked`: rewards a known validator added to the stake.
 * `deposit` and `withdrawal`: the address's own coins into staking and back. `fee`: what a staking transaction cost.
 * `unclassified`: coins that arrived from anyone else, never counted as earnings.
 */
export type StakingEventKind = "reward_paid" | "reward_restaked" | "deposit" | "withdrawal" | "fee" | "unclassified"

export interface StakingEvent {
  /** Stable across refreshes: the same event read twice is one event. */
  id: string
  /** ISO timestamp, UTC. */
  at: string
  kind: StakingEventKind
  /** Base units, never negative: the kind says the direction. */
  atoms: bigint
  /** The validator, the staking contract, or the sender. */
  counterparty: string | null
  /** Where the event comes from and how it was classified. */
  evidence: string
}

/** One address's staking for one coin: its balances now, and what happened in `[from, to)`. */
export interface StakingLedger {
  asset: StakingAsset
  address: string
  /** ISO timestamps of the half-open interval the events cover. */
  from: string
  to: string
  position: StakingPosition
  events: StakingEvent[]
  /** Whether the current validator is in the chain's public validator directory; null when unknown or not staking. */
  validatorListed: boolean | null
  /** What the data can't tell, for people. */
  notes: string[]
}

export type StakingTotals = Record<
  | "liquid"
  | "active"
  | "inactive"
  | "retired"
  | "staked"
  | "holdings"
  | "rewardsPaid"
  | "rewardsRestaked"
  | "rewards"
  | "fees"
  | "rewardsLessFees"
  | "deposits"
  | "withdrawals"
  | "netStakingTransfers"
  | "unclassified",
  bigint
>

export interface StakingSummary {
  totals: StakingTotals
  /** `YYYY-MM` (UTC), oldest first: identified rewards per month. */
  monthly: Array<{ month: string; paid: bigint; restaked: bigint }>
  /** Who paid the identified rewards, largest first. */
  senders: Array<{ address: string; atoms: bigint }>
  /** Events in `[from, to)`, deduplicated, oldest first. */
  events: StakingEvent[]
  /** Never estimated: null until a source can answer them. */
  unknown: { unpaidRewards: null; profit: null; apy: null }
}

export class StakingConflict extends Error {
  readonly id: string

  constructor(id: string) {
    super(`Two different staking events share the id ${id}.`)
    this.name = "StakingConflict"
    this.id = id
  }
}

const sameEvent = (a: StakingEvent, b: StakingEvent) =>
  a.at === b.at && a.kind === b.kind && a.atoms === b.atoms && a.counterparty === b.counterparty

/**
 * Adds up a ledger. The same event twice counts once; two different events with one id throw `StakingConflict`, since
 * one of the sources is wrong and guessing which would hide it.
 */
export function summarizeStaking(ledger: StakingLedger): StakingSummary {
  const unique = new Map<string, StakingEvent>()
  for (const event of ledger.events) {
    if (event.atoms < 0n) throw new RangeError(`Staking event ${event.id} has a negative amount.`)
    const seen = unique.get(event.id)
    if (seen && !sameEvent(seen, event)) throw new StakingConflict(event.id)
    unique.set(event.id, event)
  }
  const from = Date.parse(ledger.from)
  const to = Date.parse(ledger.to)
  const events = [...unique.values()]
    .filter((event) => {
      const at = Date.parse(event.at)
      return at >= from && at < to
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id))

  const sum: Record<StakingEventKind, bigint> = { reward_paid: 0n, reward_restaked: 0n, deposit: 0n, withdrawal: 0n, fee: 0n, unclassified: 0n }
  const months = new Map<string, { paid: bigint; restaked: bigint }>()
  const senders = new Map<string, bigint>()
  for (const event of events) {
    sum[event.kind] += event.atoms
    if (event.kind !== "reward_paid" && event.kind !== "reward_restaked") continue
    const month = new Date(event.at).toISOString().slice(0, 7)
    const row = months.get(month) ?? { paid: 0n, restaked: 0n }
    if (event.kind === "reward_paid") row.paid += event.atoms
    else row.restaked += event.atoms
    months.set(month, row)
    const sender = event.counterparty ?? "unknown"
    senders.set(sender, (senders.get(sender) ?? 0n) + event.atoms)
  }

  const { liquid, active, inactive, retired } = ledger.position
  const staked = active + inactive + retired
  const rewards = sum.reward_paid + sum.reward_restaked
  return {
    totals: {
      liquid,
      active,
      inactive,
      retired,
      staked,
      holdings: liquid + staked,
      rewardsPaid: sum.reward_paid,
      rewardsRestaked: sum.reward_restaked,
      rewards,
      fees: sum.fee,
      rewardsLessFees: rewards - sum.fee,
      deposits: sum.deposit,
      withdrawals: sum.withdrawal,
      netStakingTransfers: sum.deposit - sum.withdrawal,
      unclassified: sum.unclassified,
    },
    monthly: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, row]) => ({ month, ...row })),
    senders: [...senders].sort(([, a], [, b]) => (a === b ? 0 : a > b ? -1 : 1)).map(([address, atoms]) => ({ address, atoms })),
    events,
    unknown: { unpaidRewards: null, profit: null, apy: null },
  }
}

/** Base units as an exact decimal string of coins: 1234500000n with 5 decimals is "12345". */
export function formatUnits(atoms: bigint, decimals: number) {
  const negative = atoms < 0n
  const absolute = negative ? -atoms : atoms
  const scale = 10n ** BigInt(decimals)
  const whole = absolute / scale
  const fraction = (absolute % scale).toString().padStart(decimals, "0").replace(/0+$/, "")
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`
}
