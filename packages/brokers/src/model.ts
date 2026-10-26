// The one data model every broker answers in: per account, what it holds and the cash it keeps, at the broker's prices.

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

export interface BrokerAccount {
  /** The broker's account number: U1234567. */
  id: string
  positions: Position[]
  cash: CashBalance[]
}

export interface BrokerProvider {
  readonly id: BrokerProviderId
  /** For people: "Interactive Brokers". */
  readonly name: string
  /** Every account the credentials report on, with its positions and cash now. */
  accounts(): Promise<BrokerAccount[]>
}
