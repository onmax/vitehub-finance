// Account kinds as people read them, how /accounts groups them, and what each connection provider is called.
// Icons here must be in nuxt.config's `icon.clientBundle.icons`: the icon scanner reads .vue files, not .ts.
import type { AccountKind, ConnectionStatus, ProviderId } from "#shared/api"
import type { ConnectPage } from "./connect-catalog"
import { CURRENCIES as SUPPORTED } from "#shared/money"

export const ACCOUNT_KINDS: Record<AccountKind, { label: string; icon: string; group: AccountGroup }> = {
  checking: { get label() { return translate('checking') }, icon: "i-lucide-landmark", group: "cash" },
  savings: { get label() { return translate('savings') }, icon: "i-lucide-piggy-bank", group: "cash" },
  cash: { get label() { return translate('cash') }, icon: "i-lucide-wallet", group: "cash" },
  credit: { get label() { return translate('creditCard') }, icon: "i-lucide-credit-card", group: "credit" },
  loan: { get label() { return translate('loan') }, icon: "i-lucide-hand-coins", group: "credit" },
  investment: { get label() { return translate('investments') }, icon: "i-lucide-trending-up", group: "investments" },
  crypto: { get label() { return translate('crypto') }, icon: "i-lucide-bitcoin", group: "crypto" },
  other: { get label() { return translate('other') }, icon: "i-lucide-box", group: "other" },
}

export type AccountGroup = "cash" | "credit" | "investments" | "crypto" | "other"

export const ACCOUNT_GROUPS: Array<{ id: AccountGroup; label: string }> = [
  { id: "cash", get label() { return translate('cashGroup') } },
  { id: "credit", get label() { return translate('creditAndLoans') } },
  { id: "investments", get label() { return translate('investments') } },
  { id: "crypto", get label() { return translate('crypto') } },
  { id: "other", get label() { return translate('other') } },
]

export const ACCOUNT_KIND_ITEMS = (Object.keys(ACCOUNT_KINDS) as AccountKind[]).map((value) => ({
  value,
  get label() { return ACCOUNT_KINDS[value].label },
  icon: ACCOUNT_KINDS[value].icon,
}))

export const PROVIDERS: Record<ProviderId, { label: string; kind: "bank" | "exchange" | "wallet" | "broker" | "manual" }> = {
  enable_banking: { get label() { return translate('bank') }, kind: "bank" },
  kraken: { label: "Kraken", kind: "exchange" },
  binance: { label: "Binance", kind: "exchange" },
  coinbase: { label: "Coinbase", kind: "exchange" },
  bitcoin: { label: "Bitcoin", kind: "wallet" },
  ethereum: { label: "Ethereum", kind: "wallet" },
  polygon: { label: "Polygon", kind: "wallet" },
  solana: { label: "Solana", kind: "wallet" },
  xrpl: { label: "XRP Ledger", kind: "wallet" },
  nimiq: { label: "Nimiq", kind: "wallet" },
  ibkr: { label: "Interactive Brokers", kind: "broker" },
  myinvestor: { label: "MyInvestor", kind: "broker" },
  manual: { get label() { return translate('manual') }, kind: "manual" },
}

/** The connect page for a provider: banks and manual accounts, exchanges and wallets, or investment platforms. */
export function connectPageOf(provider: ProviderId): ConnectPage {
  const kind = PROVIDERS[provider].kind
  if (kind === "broker") return "/connect/investments"
  return kind === "exchange" || kind === "wallet" ? "/connect/crypto" : "/connect/banks"
}

/** A connection's state in words, and the semantic color its dot takes. */
export const CONNECTION_STATUS: Record<ConnectionStatus, { label: string; color: "success" | "warning" | "error" | "neutral" }> = {
  active: { get label() { return translate('upToDate') }, color: "success" },
  pending: { get label() { return translate('waitingForTheBank') }, color: "neutral" },
  expired: { get label() { return translate('consentExpired') }, color: "warning" },
  error: { get label() { return translate('syncFailed') }, color: "error" },
  revoked: { get label() { return translate('disconnected') }, color: "neutral" },
}

/** For selects, which want a mutable list. */
export const CURRENCIES: string[] = [...SUPPORTED]
