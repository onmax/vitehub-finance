import * as v from "valibot"
import type { AccountSummary, Recurring, Transaction } from "#shared/api"
import { formatMoney } from "#shared/money"

/** Every tool's optional scope input. */
export const ScopeInput = v.optional(
  v.pipe(
    v.picklist(["household", "me"]),
    v.description("me (default): only the user's own accounts, like the app's Personal view. household: the user's accounts plus the ones others shared."),
  ),
)

export const money = (minor: number, currency: string) => formatMoney(minor, currency, { locale: "en" })
export const signed = (minor: number, currency: string) => formatMoney(minor, currency, { locale: "en", signed: true })

export const text = (value: string) => [{ type: "text" as const, text: value }]

export const accountLine = (account: AccountSummary, base: string) =>
  `- ${account.name} (${account.kind}${account.institution ? `, ${account.institution}` : ""}, ${account.ownerName}'s, ${account.visibility === "private" ? "private" : "shared"}${account.archived ? ", archived" : ""}${account.includeInNetWorth ? "" : ", not in net worth"}): ${money(account.balanceMinor, account.currency)}${account.currency !== base ? ` (${money(account.balanceBaseMinor, base)})` : ""} id=${account.id}`

export const transactionLine = (row: Transaction, categories: Map<string, string>) =>
  `- ${row.date} ${signed(row.amountMinor, row.currency)} ${row.counterparty ? `${row.counterparty}: ` : ""}${row.description} [${row.categoryId ? (categories.get(row.categoryId) ?? "?") : "uncategorized"}] on ${row.accountName}${row.excluded ? " (excluded)" : ""}${row.hidden ? " (hidden from the household)" : ""}${row.status === "pending" ? " (pending)" : ""}${row.note ? ` note: ${row.note}` : ""} id=${row.id}`

export const recurringLine = (row: Recurring, base: string) =>
  `- ${row.name}: ${signed(row.amountMinor, row.currency)} ${row.cadence}, next ${row.nextDate}, ${money(Math.abs(row.monthlyMinor), base)}/month, on ${row.accountName} (${row.ownerName})${row.status === "detected" ? "" : `, ${row.status}`} id=${row.id}`
