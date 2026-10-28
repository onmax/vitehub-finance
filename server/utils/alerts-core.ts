// Which alerts someone gets, from data the server already computes. Pure logic: server/utils/alerts.ts reads the
// database and the forecast around it, and stores settings and dismissals.
import type { Alert, AlertSettings, AlertSeverity, Budget, ConnectionSummary, ForecastDay, Insight } from "#shared/api"
import { toMinor } from "../../shared/money"

/** How far ahead a low balance alerts, and how far back a large payment does. */
export const LOW_BALANCE_DAYS = 30
export const LARGE_PAYMENT_DAYS = 14

const RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }

export function defaultAlertSettings(currency: string): AlertSettings {
  return {
    currency,
    budget: { enabled: true, percent: 90 },
    lowBalance: { enabled: true, thresholdMinor: 0 },
    largeTransaction: { enabled: true, thresholdMinor: toMinor(500, currency) },
    priceIncrease: { enabled: true },
  }
}

/** Stored settings over the defaults, so a setting added later starts at its default. */
export function mergeAlertSettings(stored: unknown, currency: string): AlertSettings {
  const base = defaultAlertSettings(currency)
  if (!stored || typeof stored !== "object") return base
  const saved = stored as Partial<AlertSettings>
  return {
    currency,
    budget: { ...base.budget, ...saved.budget },
    lowBalance: { ...base.lowBalance, ...saved.lowBalance },
    largeTransaction: { ...base.largeTransaction, ...saved.largeTransaction },
    priceIncrease: { ...base.priceIncrease, ...saved.priceIncrease },
  }
}

/** An alert before dismissals are known; `Omit` per member, so each kind keeps its own fields. */
type WithoutDismissal<T> = T extends unknown ? Omit<T, "dismissedAt"> : never
type Draft = WithoutDismissal<Alert>

/** Expired or failing connections stop syncing; one whose consent ends soon will. */
export function connectionAlerts(connections: ConnectionSummary[], today: string): Draft[] {
  return connections.map((connection) => {
    const ending = connection.status === "active" && connection.consentExpiresAt
    return {
      kind: "connection",
      connection,
      // A new failure, or a consent renewed and running out again, is a new alert.
      key: `connection:${connection.id}:${connection.status}:${ending ? connection.consentExpiresAt!.slice(0, 10) : ""}`,
      severity: ending ? "warning" : "critical",
      date: ending ? connection.consentExpiresAt!.slice(0, 10) : (connection.lastSyncedAt?.slice(0, 10) ?? today),
    }
  })
}

/** Budgets past `percent` of their amount this month, and over it. */
export function budgetAlerts(budgets: Budget[], settings: AlertSettings, currency: string, month: string, today: string): Draft[] {
  if (!settings.budget.enabled) return []
  return budgets.flatMap((budget): Draft[] => {
    const available = budget.availableMinor ?? budget.amountMinor
    if (available <= 0) return []
    const over = budget.spentMinor > available
    if (!over && budget.spentMinor < (available * settings.budget.percent) / 100) return []
    return [{
      kind: "budget",
      budgetId: budget.id,
      categoryId: budget.categoryId,
      spentMinor: budget.spentMinor,
      amountMinor: available,
      currency,
      month,
      key: `budget:${budget.id}:${month}:${over ? "over" : "near"}`,
      severity: over ? "warning" : "info",
      date: today,
    }]
  })
}

/** The first day in the next `LOW_BALANCE_DAYS` the expected balance goes under the threshold. */
export function lowBalanceAlert(days: ForecastDay[], settings: AlertSettings, currency: string, today: string): Draft[] {
  if (!settings.lowBalance.enabled) return []
  const until = addDays(today, LOW_BALANCE_DAYS)
  const day = days.find((entry) => entry.date > today && entry.date <= until && entry.balanceMinor < settings.lowBalance.thresholdMinor)
  if (!day) return []
  return [{
    kind: "low_balance",
    balanceMinor: day.balanceMinor,
    thresholdMinor: settings.lowBalance.thresholdMinor,
    currency,
    // One alert per month it's about and threshold: the day moves as the forecast does.
    key: `low_balance:${day.date.slice(0, 7)}:${settings.lowBalance.thresholdMinor}`,
    severity: day.balanceMinor < 0 ? "critical" : "warning",
    date: day.date,
  }]
}

export interface Payment {
  id: string
  date: string
  description: string
  account: string
  amountMinor: number
  currency: string
  /** The amount in the household's currency, positive. */
  baseMinor: number
}

/** Payments out of at least the threshold, in the household's currency. */
export function largePaymentAlerts(payments: Payment[], settings: AlertSettings): Draft[] {
  if (!settings.largeTransaction.enabled) return []
  return payments
    .filter((payment) => payment.baseMinor >= settings.largeTransaction.thresholdMinor)
    .map((payment) => ({
      kind: "large_transaction",
      transactionId: payment.id,
      description: payment.description,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      account: payment.account,
      key: `transaction:${payment.id}`,
      severity: "info",
      date: payment.date,
    }))
}

/** Subscriptions and bills that got more expensive: the same insight the Recurring page shows. */
export function priceIncreaseAlerts(insights: Insight[], settings: AlertSettings, today: string): Draft[] {
  if (!settings.priceIncrease.enabled) return []
  return insights.flatMap((insight): Draft[] => {
    const translation = insight.translation
    if (insight.kind !== "price_increase" || translation?.kind !== "price_increase") return []
    return [{
      kind: "price_increase",
      recurringIds: insight.recurringIds,
      name: translation.name,
      previousMinor: translation.previous,
      latestMinor: translation.latest,
      currency: translation.currency,
      percent: translation.percent,
      key: `price_increase:${insight.recurringIds.join(",")}:${translation.latest}`,
      severity: "info",
      date: today,
    }]
  })
}

/** Most urgent first, then newest. */
export function sortAlerts<T extends Pick<Alert, "severity" | "date">>(alerts: T[]) {
  return [...alerts].sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.date.localeCompare(a.date))
}

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
