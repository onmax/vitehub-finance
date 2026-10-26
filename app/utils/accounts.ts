// Account kinds as people read them, how /accounts groups them, and what each connection provider is called.
// Icons here must be in nuxt.config's `icon.clientBundle.icons`: the icon scanner reads .vue files, not .ts.
import type { AccountKind, ConnectionStatus, ProviderId } from "#shared/api"

export const ACCOUNT_KINDS: Record<AccountKind, { label: string; icon: string; group: AccountGroup }> = {
  checking: { label: "Checking", icon: "i-lucide-landmark", group: "cash" },
  savings: { label: "Savings", icon: "i-lucide-piggy-bank", group: "cash" },
  cash: { label: "Cash", icon: "i-lucide-wallet", group: "cash" },
  credit: { label: "Credit card", icon: "i-lucide-credit-card", group: "credit" },
  loan: { label: "Loan", icon: "i-lucide-hand-coins", group: "credit" },
  investment: { label: "Investments", icon: "i-lucide-trending-up", group: "investments" },
  crypto: { label: "Crypto", icon: "i-lucide-bitcoin", group: "crypto" },
  other: { label: "Other", icon: "i-lucide-box", group: "other" },
}

export type AccountGroup = "cash" | "credit" | "investments" | "crypto" | "other"

export const ACCOUNT_GROUPS: Array<{ id: AccountGroup; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "credit", label: "Credit and loans" },
  { id: "investments", label: "Investments" },
  { id: "crypto", label: "Crypto" },
  { id: "other", label: "Other" },
]

export const ACCOUNT_KIND_ITEMS = (Object.keys(ACCOUNT_KINDS) as AccountKind[]).map((value) => ({
  value,
  label: ACCOUNT_KINDS[value].label,
  icon: ACCOUNT_KINDS[value].icon,
}))

export const PROVIDERS: Record<ProviderId, { label: string; kind: "bank" | "exchange" | "wallet" | "manual" }> = {
  enable_banking: { label: "Bank", kind: "bank" },
  kraken: { label: "Kraken", kind: "exchange" },
  binance: { label: "Binance", kind: "exchange" },
  coinbase: { label: "Coinbase", kind: "exchange" },
  bitcoin: { label: "Bitcoin", kind: "wallet" },
  ethereum: { label: "Ethereum", kind: "wallet" },
  solana: { label: "Solana", kind: "wallet" },
  xrpl: { label: "XRP Ledger", kind: "wallet" },
  manual: { label: "Manual", kind: "manual" },
}

/** A connection's state in words, and the semantic color its dot takes. */
export const CONNECTION_STATUS: Record<ConnectionStatus, { label: string; color: "success" | "warning" | "error" | "neutral" }> = {
  active: { label: "Up to date", color: "success" },
  pending: { label: "Waiting for the bank", color: "neutral" },
  expired: { label: "Consent expired", color: "warning" },
  error: { label: "Sync failed", color: "error" },
  revoked: { label: "Disconnected", color: "neutral" },
}

export const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "MXN", "JPY"]
