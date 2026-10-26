// What every provider (a bank, an exchange, a wallet) hands the sync engine. The fetching lives in the workspace
// packages (@vitehub-finance/banking, @vitehub-finance/crypto); these adapters map their models and errors to the
// engine's. Providers only fetch and map; the engine (server/utils/sync.ts) owns the database.
import { BankingError } from "@vitehub-finance/banking"
import { CryptoError } from "@vitehub-finance/crypto"
import type { AccountKind } from "../../shared/api"

/** Sent on every outgoing API call. Workers send none by default, and some APIs refuse requests without one. */
export const USER_AGENT = "ViteHubFinance/0.1 (+https://github.com/onmax/vitehub-finance)"

export interface ProviderTransaction {
  externalId?: string | null
  /** What decides whether a row is new. Providers with flaky ids compute it (see dedupe.ts); the engine fills missing ones. */
  dedupeKey?: string
  date: string
  amountMinor: number
  currency: string
  description: string
  counterparty?: string | null
}

export interface ProviderHolding {
  symbol: string
  name?: string | null
  quantity: number
}

export interface ProviderAccount {
  externalId: string
  name: string
  kind: AccountKind
  currency: string
  balanceMinor?: number
  iban?: string | null
  institution?: string | null
  holdings?: ProviderHolding[]
  transactions?: ProviderTransaction[]
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
  /** `YYYY-MM-DD`: fetch transactions from this day on. Null fetches whatever the provider gives by default. */
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
  if (error instanceof BankingError) return new ProviderError(error.code === "invalid_credentials" ? "auth" : error.code, error.message)
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
