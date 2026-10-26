// The one data model every bank provider answers in. Money is integer minor units (cents) plus an ISO 4217 currency.

export type BankAccountKind = "checking" | "savings" | "credit" | "loan"

export interface Institution {
  name: string
  /** ISO 3166 alpha-2. */
  country: string
  logo: string | null
  /** How long a consent at this bank can last. */
  maxConsentDays: number | null
  /** Whether it serves personal accounts (some list business accounts only). */
  personal: boolean
}

export interface BankAccount {
  /** The provider's id for the account within a consent. */
  uid: string
  /** For people: "Revolut SEK". Never the holder's name. */
  name: string
  iban: string | null
  currency: string
  kind: BankAccountKind
}

/** What a person allowed at their bank: which accounts, until when. */
export interface Consent {
  id: string
  institution: { name: string; country: string } | null
  accounts: BankAccount[]
  expiresAt: Date | null
}

export interface Money {
  amountMinor: number
  currency: string
}

export interface BankTransaction {
  /** The bank's id when it sends one; banks often don't. */
  externalId: string | null
  /** `YYYY-MM-DD`, the booking date. */
  date: string
  /** Negative for money out. */
  amountMinor: number
  currency: string
  description: string
  /** Whoever is on the other side: the creditor of a payment, the debtor of a deposit. */
  counterparty: string | null
}

export interface AuthorizeInput {
  institution: { name: string; country: string }
  /** Echoed back on the redirect, to tie it to whoever started. */
  state: string
  redirectUrl: string
  /** Capped at the bank's maximum and 180 days. */
  validDays?: number | null
}

export interface BankingProvider {
  readonly id: string
  readonly name: string
  institutions(country: string): Promise<Institution[]>
  /** The bank's consent page; the person comes back to `redirectUrl` with `code` and `state`. */
  authorize(input: AuthorizeInput): Promise<string>
  /** Trades the redirect's `code` for the consent. */
  completeAuthorization(code: string): Promise<Consent>
  /** The balance people expect to see (available before booked), or null when the bank has none. */
  balance(consentId: string, accountUid: string): Promise<Money | null>
  /** Booked transactions from `since` (`YYYY-MM-DD`) on, or the bank's default window. */
  transactions(consentId: string, accountUid: string, options?: { since?: string | null }): Promise<BankTransaction[]>
  /** Ends the consent at the bank. Best effort: never throws. */
  revoke(consentId: string): Promise<void>
}
