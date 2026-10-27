import { and, eq, gte, isNull, lt, ne, or } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import type { Alert, AlertSettings, AlertsResponse } from "#shared/api"
import { alertDismissal, alertPreference, category, financialAccount, transaction } from "../databases/config"
import { visibleTransactions } from "./access"
import { baseCurrency, householdCurrency } from "./accounts"
import {
  budgetAlerts,
  connectionAlerts,
  LARGE_PAYMENT_DAYS,
  largePaymentAlerts,
  lowBalanceAlert,
  mergeAlertSettings,
  priceIncreaseAlerts,
  sortAlerts,
} from "./alerts-core"
import { listBudgets } from "./budgets"
import { addDays, monthOf, todayIso } from "./dates"
import { forecast } from "./forecast"
import type { Member } from "./identity"
import { needsAttention } from "./overview"
import { recurringOverview } from "./recurring"

export async function alertSettings(who: Member): Promise<AlertSettings> {
  const [row] = await db.select({ settings: alertPreference.settings }).from(alertPreference).where(eq(alertPreference.userId, who.userId)).limit(1)
  return mergeAlertSettings(row?.settings, await householdCurrency(who.householdId))
}

export async function saveAlertSettings(who: Member, settings: Omit<AlertSettings, "currency">) {
  await db
    .insert(alertPreference)
    .values({ userId: who.userId, settings })
    .onConflictDoUpdate({ target: alertPreference.userId, set: { settings, updatedAt: new Date() } })
  return alertSettings(who)
}

/**
 * Everything the caller should look at, open and dismissed, from what they can see: the household's accounts that
 * are shared with them and their own, never another member's private account or hidden transaction.
 */
export async function listAlerts(who: Member): Promise<AlertsResponse> {
  const settings = await alertSettings(who)
  const { currency, convert } = await baseCurrency(who)
  const today = todayIso()
  const month = monthOf(today)
  const [connections, budgets, ahead, recurring, payments, dismissed] = await Promise.all([
    needsAttention(who, "household"),
    settings.budget.enabled ? listBudgets(who, "household", month) : null,
    settings.lowBalance.enabled ? forecast(who, "household", 2) : null,
    settings.priceIncrease.enabled ? recurringOverview(who, "household") : null,
    settings.largeTransaction.enabled ? recentPayments(who, addDays(today, -LARGE_PAYMENT_DAYS), convert) : [],
    db.select({ key: alertDismissal.key, at: alertDismissal.dismissedAt }).from(alertDismissal).where(eq(alertDismissal.userId, who.userId)),
  ])
  const drafts = [
    ...connectionAlerts(connections, today),
    ...budgetAlerts(budgets?.items ?? [], settings, currency, month, today),
    ...lowBalanceAlert(ahead?.days ?? [], settings, currency, today),
    ...largePaymentAlerts(payments, settings),
    ...priceIncreaseAlerts(recurring?.insights ?? [], settings, today),
  ]
  const when = new Map(dismissed.map((row) => [row.key, row.at.toISOString()]))
  const alerts = sortAlerts(drafts.map((draft) => ({ ...draft, dismissedAt: when.get(draft.key) ?? null }) as Alert))
  const open = alerts.filter((alert) => !alert.dismissedAt)
  return { alerts, open: open.length, severity: open[0]?.severity ?? null }
}

/** Money out of visible accounts since `from`, not a transfer between them, with its amount in the household's currency. */
async function recentPayments(who: Member, from: string, convert: (minor: number, currency: string) => number) {
  const rows = await db
    .select({
      id: transaction.id,
      date: transaction.date,
      description: transaction.description,
      counterparty: transaction.counterparty,
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
      account: financialAccount.name,
    })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(
      and(
        visibleTransactions(who, "household"),
        eq(transaction.excluded, false),
        isNull(transaction.transferId),
        or(isNull(category.kind), ne(category.kind, "transfer")),
        gte(transaction.date, from),
        lt(transaction.amountMinor, 0),
      ),
    )
  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    description: row.counterparty || row.description,
    account: row.account,
    amountMinor: row.amountMinor,
    currency: row.currency,
    baseMinor: convert(-row.amountMinor, row.currency),
  }))
}

export async function dismissAlert(who: Member, key: string) {
  await db.insert(alertDismissal).values({ userId: who.userId, key }).onConflictDoNothing()
}

export async function restoreAlert(who: Member, key: string) {
  await db.delete(alertDismissal).where(and(eq(alertDismissal.userId, who.userId), eq(alertDismissal.key, key)))
}
