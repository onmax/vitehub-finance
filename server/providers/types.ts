// What every provider (a bank through Enable Banking, an exchange, a wallet) hands the sync engine.
// Providers only fetch and map; the engine (server/utils/sync.ts) owns the database.
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

/** A short, readable reason from a provider's error body, for `lastError` and API responses. */
export function describeBody(body: unknown, fallback: string) {
  if (typeof body === "string") return body.slice(0, 200) || fallback
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>
    for (const key of ["message", "msg", "error_description", "detail", "error"]) {
      const value = record[key]
      if (typeof value === "string" && value) return value.slice(0, 200)
      if (Array.isArray(value) && value.length) return value.map(String).join(", ").slice(0, 200)
    }
  }
  return fallback
}

/** Reads a JSON (or text) body without throwing on malformed responses. */
export async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "")
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** Network failures and timeouts become `unavailable`, so the run records a readable reason. */
export async function request(name: string, url: string, init: RequestInit = {}) {
  try {
    const headers = new Headers(init.headers)
    if (!headers.has("user-agent")) headers.set("user-agent", USER_AGENT)
    return await fetch(url, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(20_000) })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new ProviderError("unavailable", `${name} could not be reached (${reason}).`)
  }
}
