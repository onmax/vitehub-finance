// The one data model every broker answers in: per account, what it holds and the cash it keeps at the broker's prices,
// and, over the period the broker reports on, its trades, its cash movements, and what it was worth each day.

export type BrokerId = "ibkr"
export type BrokerProviderId = BrokerId | "fake"

export interface Position {
  /** The broker's ticker: AAPL, VWCE, or an option's OCC symbol. */
  symbol: string
  /** The instrument's name when the broker says it. */
  description: string | null
  /** The broker's asset class: STK (stocks and ETFs), OPT, FUT, FUND, BOND, CRYPTO, … */
  assetClass: string
  /** Units held, negative when short. */
  quantity: number
  /** The broker's price per unit, in `currency`. */
  markPrice: number
  /** What the position is worth in `currency`, multiplier included, negative when short. */
  value: number
  /** ISO 4217, the currency the instrument trades in. */
  currency: string
  /** The broker's own id for the instrument (IBKR's conid), when it gives one. */
  id: string | null
  isin: string | null
}

export interface CashBalance {
  /** ISO 4217. */
  currency: string
  /** Negative when the account borrows in that currency. */
  amount: number
}

/** A buy or a sell. */
export interface Trade {
  /** The broker's id for it, when it gives one. */
  id: string | null
  /** `YYYY-MM-DD`, the trade date. */
  date: string
  symbol: string
  description: string | null
  /** Units bought, negative when sold. */
  quantity: number
  /** Per unit, in `currency`. */
  price: number
  /** What the cash changed by, commission included: negative for a buy. */
  netCash: number
  currency: string
}

/** Money in or out of the account that isn't a trade: a deposit, a withdrawal, a dividend, its tax, interest, a fee. */
export interface CashMovement {
  id: string | null
  /** `YYYY-MM-DD`. */
  date: string
  /** The broker's kind for it, as it names it: "Deposits/Withdrawals", "Dividends", "Withholding Tax", "Other Fees", … */
  type: string
  description: string
  /** Negative when money left. */
  amount: number
  currency: string
}

/** What the whole account was worth at the end of a day, in the account's base currency. */
export interface DailyValue {
  /** `YYYY-MM-DD`. */
  date: string
  value: number
  currency: string
}

export interface BrokerAccount {
  /** The broker's account number: U1234567. */
  id: string
  positions: Position[]
  cash: CashBalance[]
  /** Over the period the broker reported on, oldest first; empty when it reports none. */
  trades: Trade[]
  cashMovements: CashMovement[]
  history: DailyValue[]
}

export interface BrokerProvider {
  readonly id: BrokerProviderId
  /** For people: "Interactive Brokers". */
  readonly name: string
  /** Every account the credentials report on, with its positions and cash now. */
  accounts(): Promise<BrokerAccount[]>
}
