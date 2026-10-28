// What every provider (a bank, an exchange, a wallet, a broker) hands the sync engine. The fetching lives in the
// workspace packages (@vitehub-finance/banking, @vitehub-finance/crypto, @vitehub-finance/brokers); these adapters map
// their models and errors to the engine's. Providers only fetch and map; the engine (server/utils/sync.ts) owns the
// database.
import { errorCode } from "../utils/error-codes"
import type { CoinHistory } from "../utils/holdings-history"
import { BankingError } from "@vitehub-finance/banking"
import { BrokerError } from "@vitehub-finance/brokers"
import { CryptoError, type StakingLedger } from "@vitehub-finance/crypto"
import { PaymentsError } from "@vitehub-finance/payments"
import type { AccountKind, PaymentBalance, PaymentLedger } from "../../shared/api"

/** Sent on every outgoing API call. Workers send none by default, and some APIs refuse requests without one. */
export const USER_AGENT = "ViteHubFinance/0.1 (+https://github.com/onmax/vitehub-finance)"

export interface ProviderTransaction {
  payment?: PaymentLedger
  externalId?: string | null
  /** What decides whether a row is new. Providers with flaky ids compute it (see dedupe.ts); the engine fills missing ones. */
  dedupeKey?: string
  date: string
  amountMinor: number
  currency: string
  description: string
  counterparty?: string | null
  /** A move between the household's own money: it gets the transfer category unless a rule says otherwise. */
  transfer?: boolean
}

/**
 * A movement of coins on an account whose balance is its holdings (a wallet). The engine values it in the account's
 * currency at the coin's price on `date` (server/utils/prices.ts).
 */
export interface ProviderCoinTransaction extends Omit<ProviderTransaction, "amountMinor" | "currency"> {
  symbol: string
  /** Whole coins, signed, fee included: what the holding changed by. */
  quantity: number
}

export interface ProviderHolding {
  symbol: string
  name?: string | null
  quantity: number
  /**
   * The provider's own price and value in `currency`, major units (a broker's mark price). Without it the engine prices
   * the symbol as a coin.
   */
  quote?: { currency: string; price: number; value: number }
}

export interface ProviderAccount {
  externalId: string
  name: string
  kind: AccountKind
  currency: string
  balanceMinor?: number
  paymentBalance?: PaymentBalance
  iban?: string | null
  institution?: string | null
  holdings?: ProviderHolding[]
  transactions?: ProviderTransaction[]
  /** Only with `holdings`: coin movements the engine values into transactions. */
  coinTransactions?: ProviderCoinTransaction[]
  /**
   * Only with `holdings`: every change to their quantities the provider read, dust and fees included, for the engine to
   * walk back from today's holdings into a balance history. Left out when the history couldn't be read.
   */
  coinHistory?: CoinHistory
  /**
   * Only with `holdings`: what the whole account was worth at the end of past days, by the provider's own count (a
   * broker's net asset value), for the engine to fill the balance chart's missing days with.
   */
  dailyValues?: Array<{ date: string; value: number; currency: string }>
  /** Only with `holdings`: a complete, fresh read of the account's staking (a Nimiq wallet). Left out when it failed. */
  staking?: StakingLedger
  /** Set when this one account failed; the others still sync. */
  error?: string
}

export interface ProviderResult<C = unknown> {
  accounts: ProviderAccount[]
  consentExpiresAt?: Date | null
  /** Updated credentials to re-seal (a refreshed session). */
  credentials?: C
}

export interface FetchOptions {
  /** Processor rows still awaiting settlement, including those outside the incremental date window. */
  pendingPaymentIds?: string[]
  /** Previously seen processor currencies, including accounts whose current balance is now zero. */
  paymentCurrencies?: string[]
  /** `YYYY-MM-DD`: fetch transactions from this day on. Null fetches whatever the provider gives by default: for a wallet, its whole history. */
  since: string | null
  /** The first sync after linking. */
  initial: boolean
}

export type Provider<C = unknown> = (credentials: C, options: FetchOptions) => Promise<ProviderResult<C>>

export type ProviderErrorCode = "expired" | "auth" | "rate_limited" | "unavailable"

/**
 * A failure the sync can explain to people: `expired` makes the connection `expired` (reconnect), anything else `error`.
 * The message is shown as is, so it says what to do.
 */
export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "ProviderError"
  }
}

/** The packages' errors in the engine's terms: anything the person must fix (a key, an address) is `auth`. */
export function asProviderError(error: unknown): unknown {
  if (error instanceof PaymentsError)
    return new ProviderError(
      error.code === "invalid_credentials" || error.code === "permissions" || error.code === "live_required" ? "auth" : error.code,
      error.message,
    )
  if (error instanceof BankingError) return new ProviderError(error.code === "invalid_credentials" ? "auth" : error.code, error.message)
  if (error instanceof BrokerError) return new ProviderError(error.code === "invalid_credentials" ? "auth" : error.code, error.message)
  if (error instanceof CryptoError)
    return new ProviderError(error.code === "invalid_credentials" || error.code === "invalid_address" ? "auth" : error.code, error.message)
  return error
}

/** Runs a package call and rethrows its error as a ProviderError. */
export async function mapped<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    throw asProviderError(error)
  }
}

export function providerMessageCode(error: unknown): string {
  if (!(error instanceof ProviderError)) return "providerUnavailable"
  const specific = errorCode(error.message)
  if (specific !== "providerUnavailable") return specific
  return { auth: "providerAuth", expired: "providerExpired", rate_limited: "providerRateLimited", unavailable: "providerUnavailable" }[error.code]
}
