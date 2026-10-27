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
  | "ibkr"
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
  /** The bank's logo from Enable Banking, for accounts of a bank connection; shared/banks.ts covers the rest. */
  logo: string | null
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
  /** Only the account's owner sees it. Others get it in no list, total, or chart; only the owner gets `hidden: true`. */
  hidden: boolean
  /** The other account of a detected move between the household's accounts, when the caller can see it. */
  transferWith: string | null
  canEdit: boolean
  /** The caller owns the account, so they may hide it from the household or show it again. */
  canHide: boolean
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
    month: string
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

export type InsightTranslation =
  | { kind: "price_increase"; name: string; percent: number; latest: number; previous: number; currency: string; base: string; cadence: Cadence; account: string }
  | { kind: "duplicate"; name: string; owners: string[]; monthly: number[]; currency: string; count: number }
  | { kind: "large_subscription"; name: string; monthly: number; yearly: number; currency: string; account: string }

export interface Insight {
  translation?: InsightTranslation
  kind: "price_increase" | "duplicate" | "unused" | "large_subscription"
  title: string
  detail: string
  /** What acting on it saves per year, in the household's currency. */
  savingsMinor: number
  recurringIds: string[]
}

/** What a recurring series is to the forecast: money in, a bill, or a move between accounts. */
export type ForecastKind = "income" | "bill" | "transfer"

/**
 * How sure the forecast is that a payment lands when and as much as expected. `high`: the same amount within 3 days of
 * its date, 4 times or more (twice for yearly ones) or confirmed. `medium`: within a week and 25% of the amount.
 * `low`: anything less regular.
 */
export type ForecastConfidence = "high" | "medium" | "low"

/** A recurring series the forecast counts (not dismissed, on an account it projects). */
export interface ForecastSeries {
  /** The recurring row's id. */
  id: string
  name: string
  kind: ForecastKind
  /** What one payment is expected to be, in the household's currency: negative for charges. */
  amountMinor: number
  cadence: Cadence
  accountId: string
  accountName: string
  ownerName: string
  categoryId: string | null
  status: "detected" | "confirmed"
  confidence: ForecastConfidence
  /** Payments seen in the last 400 days. */
  occurrences: number
  /** How many days a payment has landed away from its usual date, at most (recent payments). */
  dayRange: number
  /** How much the amount moves around its usual value, as a share of it: 0.18 is ±18%. */
  amountRange: number
}

/** One expected payment of a series. */
export interface ForecastPayment {
  seriesId: string
  date: string
  /** Household currency, negative for charges. */
  amountMinor: number
}

/** The expected balance at the end of a day, and the range it likely lands in (8 times in 10). */
export interface ForecastDay {
  date: string
  balanceMinor: number
  lowMinor: number
  highMinor: number
}

export interface ForecastMonth {
  month: string
  label: string
  /** The balance the month starts with (today's, for the current month). */
  startMinor: number
  /** Recurring income (positive). */
  incomeMinor: number
  /** Recurring bills and subscriptions (positive). */
  billsMinor: number
  /** Usual spending outside recurring payments (positive). */
  variableOutMinor: number
  /**
   * Moved to accounts the forecast doesn't count (investments, crypto, someone's private account), net of what came
   * back. Positive when money leaves.
   */
  movedOutMinor: number
  /** A one-off expense from a what-if; always 0 from the server. */
  oneOffMinor: number
  /** income − bills − variable − moved − one-off. */
  netMinor: number
  /** Expected balance at the end of the month, and its likely range. */
  balanceMinor: number
  lowMinor: number
  highMinor: number
}

/** One account's own projection: its payments, its usual spending, and its usual moves to and from other accounts. */
export interface ForecastAccount {
  id: string
  name: string
  ownerName: string
  kind: "checking" | "savings" | "cash" | "credit"
  /** Today, in the household's currency. */
  balanceMinor: number
  endMinor: number
  lowest: { date: string; balanceMinor: number }
  /** The expected balance once a week, for a sparkline. */
  weekly: Array<{ date: string; balanceMinor: number }>
}

export interface Forecast {
  currency: string
  /** The server's date, the forecast's first day. */
  today: string
  /** Cash today: checking, savings, cash, and credit accounts counted in net worth. */
  startMinor: number
  /** The actual balance of the same accounts before today, from their daily balances. */
  history: Array<{ date: string; balanceMinor: number }>
  /** Today to the end of the last month, one point a day. */
  days: ForecastDay[]
  /** One per month, the first being what's left of the current month. */
  months: ForecastMonth[]
  series: ForecastSeries[]
  /** Every expected payment of `series` from today to the end, soonest first. */
  payments: ForecastPayment[]
  accounts: ForecastAccount[]
  /** The lowest expected balance, the first day it's reached, and the low end of the range that day. */
  lowest: { date: string; balanceMinor: number; lowMinor: number }
  /** The first day the low end of the range goes below zero, or null. */
  riskDate: string | null
  /** Average monthly spending outside recurring payments, from the last 3 full months. */
  variableMonthlyMinor: number
  /** Average monthly moves to accounts the forecast doesn't count, outside recurring ones (positive: money leaves). */
  movedMonthlyMinor: number
  averageMonthlyIncomeMinor: number
  /** Positive when the household saves money each month on average. */
  monthlySavingsMinor: number
  /** Days of transaction history behind the averages and the range (0 without transactions). */
  dataDays: number
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
  /** The bank's logo from Enable Banking; null for other providers and banks without a cached one. */
  logo: string | null
  status: ConnectionStatus
  ownerId: string
  ownerName: string
  consentExpiresAt: string | null
  lastSyncedAt: string | null
  lastError: string | null
  lastErrorCode?: string | null
  accountCount: number
  canManage: boolean
}

export interface SyncRun {
  id: string
  trigger: "schedule" | "manual" | "link"
  status: "running" | "succeeded" | "failed"
  added: number
  error: string | null
  errorCode?: string | null
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
  /** Whether this ViteHub Finance can connect it. */
  available: boolean
  /**
   * Why it can't: `setup`, the server lacks the provider's credentials (Enable Banking's app id and key); `public`, the
   * demo build, which offers no bank connections.
   */
  reason?: "setup" | "public"
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
