// The REST API's response shapes, shared by server/api and the app. Money is integer minor units plus a currency.
// Lists the server builds for a `scope` (`me` | `household`) only ever contain accounts the caller may see.
import type { Scope } from "./access"

export type { Scope }

export type AccountKind = "checking" | "savings" | "credit" | "investment" | "crypto" | "cash" | "loan" | "other"
export type ProviderId =
  | "enable_banking"
  | "kraken"
  | "binance"
  | "coinbase"
  | "bitcoin"
  | "ethereum"
  | "solana"
  | "xrpl"
  | "nimiq"
  | "manual"
export type ConnectionStatus = "pending" | "active" | "expired" | "error" | "revoked"
export type Cadence = "weekly" | "monthly" | "quarterly" | "yearly"

export interface Person {
  userId: string
  name: string
  email: string
  image: string | null
  role: "owner" | "member"
}

export interface MeResponse {
  user: { id: string; name: string; email: string; image: string | null }
  household: {
    id: string
    name: string
    currency: string
    shareNewAccounts: boolean
    /** AI categories for what the rules miss, when the server has them (`ai`). */
    aiCategorize: boolean
  }
  role: "owner" | "member"
  members: Person[]
  /** True when the build can send email (magic links, invitations, reminders). */
  email: boolean
  /** True when the server has a TypeSafe key for AI categories (never in the demo). */
  ai: boolean
}

/** `POST /api/transactions/categorize`: one round of AI categories over the caller's uncategorized transactions. */
export interface AiCategorizeResult {
  asked: number
  categorized: number
  /** Uncategorized transactions AI hasn't looked at yet. */
  remaining: number
}

export interface AccountSummary {
  id: string
  name: string
  institution: string | null
  kind: AccountKind
  currency: string
  balanceMinor: number
  /** The balance in the household's currency. */
  balanceBaseMinor: number
  iban: string | null
  ownerId: string
  ownerName: string
  visibility: "private" | "household"
  householdPermission: "view" | "edit"
  includeInNetWorth: boolean
  archived: boolean
  connectionId: string | null
  provider: ProviderId | null
  connectionStatus: ConnectionStatus | null
  balanceUpdatedAt: string | null
  /** What the caller may do with it (shared/access.ts). */
  canEdit: boolean
  canManage: boolean
}

export interface Holding {
  symbol: string
  name: string | null
  quantity: number
  priceMinor: number | null
  valueMinor: number
}

export interface AccountDetail extends AccountSummary {
  holdings: Holding[]
  /** Daily balances, oldest first, in the account's currency. */
  history: Array<{ date: string; balanceMinor: number }>
}

export interface Category {
  id: string
  name: string
  kind: "expense" | "income" | "transfer"
  icon: string
  color: string
}

export interface Transaction {
  id: string
  accountId: string
  accountName: string
  ownerId: string
  ownerName: string
  date: string
  amountMinor: number
  currency: string
  description: string
  counterparty: string | null
  categoryId: string | null
  /** `ai`: suggested by AI, not yet confirmed by anyone; the UI marks it. */
  categorySource: "rule" | "ai" | "manual" | null
  note: string | null
  status: "booked" | "pending"
  excluded: boolean
  /** The other account of a detected move between the household's accounts, when the caller can see it. */
  transferWith: string | null
  canEdit: boolean
}

export interface TransactionPage {
  items: Transaction[]
  /** Pass back as `cursor` for the next page; null at the end. */
  nextCursor: string | null
  /** Sums over every match of the filters, not just this page, in the household's currency. */
  totals: { inMinor: number; outMinor: number; count: number }
}

export interface Overview {
  currency: string
  netWorthMinor: number
  /** Daily net worth for the last 90 days, oldest first. */
  netWorthSeries: Array<{ date: string; valueMinor: number }>
  month: {
    label: string
    inMinor: number
    outMinor: number
    previousInMinor: number
    previousOutMinor: number
  }
  /** This month's spending by category, largest first. */
  spending: Array<{ categoryId: string | null; name: string; icon: string; color: string; amountMinor: number }>
  upcoming: Recurring[]
  /** Connections whose consent expires within 14 days, or that failed or expired. */
  attention: ConnectionSummary[]
  recent: Transaction[]
  accountCount: number
}

export interface Recurring {
  id: string
  accountId: string
  accountName: string
  ownerName: string
  name: string
  amountMinor: number
  previousAmountMinor: number | null
  currency: string
  cadence: Cadence
  lastDate: string
  nextDate: string
  occurrences: number
  categoryId: string | null
  status: "detected" | "confirmed" | "dismissed"
  /** The cost per month in the household's currency (negative for charges). */
  monthlyMinor: number
}

export interface RecurringResponse {
  currency: string
  items: Recurring[]
  /** Subscriptions and bills, per month and per year, in the household's currency (positive numbers). */
  totals: { monthlyOutMinor: number; yearlyOutMinor: number; monthlyInMinor: number }
  /** Ways to save, found in the recurring payments. */
  insights: Insight[]
}

export interface Insight {
  kind: "price_increase" | "duplicate" | "unused" | "large_subscription"
  title: string
  detail: string
  /** What acting on it saves per year, in the household's currency. */
  savingsMinor: number
  recurringIds: string[]
}

export interface Forecast {
  currency: string
  startMinor: number
  /** Monthly points for the requested months, the first being the end of the current month. */
  months: Array<{
    month: string
    label: string
    recurringInMinor: number
    recurringOutMinor: number
    variableOutMinor: number
    balanceMinor: number
  }>
  /** Average monthly spending outside recurring payments, from the last 3 full months. */
  variableMonthlyMinor: number
  averageMonthlyIncomeMinor: number
  /** Positive when the household saves money each month on average. */
  monthlySavingsMinor: number
}

export interface Budget {
  id: string
  categoryId: string
  ownerId: string | null
  amountMinor: number
  spentMinor: number
}

export interface BudgetsResponse {
  currency: string
  month: string
  items: Budget[]
  /** Spending this month in categories without a budget. */
  unbudgetedMinor: number
  /** Moved between the household's own accounts this month: not spending, so not in any total above. */
  movedMinor: number
}

export interface Goal {
  id: string
  name: string
  icon: string
  ownerId: string | null
  targetMinor: number
  savedMinor: number
  targetDate: string | null
  accountId: string | null
  /** Saved so far: the linked account's balance, or `savedMinor`. */
  progressMinor: number
  /** What to put aside per month to reach the target by its date; null without a date. */
  monthlyNeededMinor: number | null
}

export interface ConnectionSummary {
  id: string
  provider: ProviderId
  name: string
  institution: string | null
  status: ConnectionStatus
  ownerId: string
  ownerName: string
  consentExpiresAt: string | null
  lastSyncedAt: string | null
  lastError: string | null
  accountCount: number
  canManage: boolean
}

export interface SyncRun {
  id: string
  trigger: "schedule" | "manual" | "link"
  status: "running" | "succeeded" | "failed"
  added: number
  error: string | null
  startedAt: string
  finishedAt: string | null
}

export interface Bank {
  name: string
  country: string
  logo: string | null
  /** Days a consent lasts at this bank. */
  maxConsentDays: number | null
}

export interface ProviderInfo {
  id: ProviderId
  /** Whether this ViteHub Finance has the credentials the provider needs (Enable Banking's app id and key). */
  available: boolean
}

/** `GET /api/legal` (public): what the privacy page shows about this instance. */
export interface LegalInfo {
  /** `FINANCE_CONTACT_EMAIL`, or null when the instance has none. */
  contactEmail: string | null
  /** Whether this instance sends transactions to TypeSafe for AI categories (`TYPESAFE_API_KEY`). */
  ai: boolean
}

/** An MCP client someone allowed through OAuth (GET /api/agents). */
export interface ConnectedAgent {
  id: string
  name: string
  uri: string | null
  /** Epoch milliseconds. */
  connectedAt: number | null
  /** When it last signed in again (epoch ms): agents renew their access every hour while they work. */
  lastSeenAt: number | null
}

/** One side of the money flow: a source of money in, or a place money went. */
export interface FlowNode {
  /** Stable within a response: a category id, or `uncategorized`, `other`, `savings`, `kept`. */
  id: string
  name: string
  /** The category behind it, when there is one, for links to its transactions. */
  categoryId: string | null
  /** A Tailwind palette name, like categories'. */
  color: string
  icon: string
  amountMinor: number
  /** `savings` covers spending beyond income; `kept` is income nobody spent. */
  kind: "income" | "expense" | "savings" | "kept" | "other"
}

/** `GET /api/flow`: a month's money in, by source, flowing out by category. Transfers between accounts stay out. */
export interface MoneyFlow {
  currency: string
  month: string
  from: string
  to: string
  inMinor: number
  outMinor: number
  /** Where money came from, largest first; `savings` last when spending passed income. */
  sources: FlowNode[]
  /** Where it went, largest first; `kept` last when income passed spending. */
  uses: FlowNode[]
  /** Moved between the household's accounts, left out of both sides. */
  movedMinor: number
}
