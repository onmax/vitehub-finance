// Rows someone brings in by hand: a CSV the browser parsed, or a statement an agent read (the MCP add_transactions
// tool). One path for both, so dedupe, rules, transfers, AI categories, and recurring detection behave the same.
import { eq } from "drizzle-orm"
import type { RequestLogger } from "evlog"
import * as v from "valibot"
import { financialAccount } from "../databases/config"
import { decimalToMinor, isDate } from "../providers/dedupe"
import { categorizeWithAi, SYNC_LIMIT } from "./ai-categorize"
import { errorMessage, fail } from "./connections"
import { detectRecurring } from "./recurring"
import { backfillSnapshots } from "./snapshots"
import { householdRules, insertTransactions } from "./sync"
import { detectTransfers } from "./transfers"
import type { AccountRow } from "./accounts"

const ImportRow = v.object({
  date: v.pipe(v.string(), v.trim(), v.check(isDate, "Dates must be YYYY-MM-DD.")),
  amount: v.pipe(v.number(), v.finite()),
  description: v.pipe(v.string(), v.trim(), v.minLength(1, "Every row needs a description."), v.maxLength(500)),
  counterparty: v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(200)))),
})

const IMPORT_LIMIT = 5000

export const ImportRows = v.pipe(v.array(ImportRow), v.minLength(1, "No rows to import."), v.maxLength(IMPORT_LIMIT, "Import at most 5000 rows at once."))

/**
 * Adds rows (amounts in major units of the account's currency, negative for money out) to an account the caller may
 * edit; the caller checks that. Rows already there (same date, amount, description, and position among identical ones)
 * are skipped, so bringing the same statement twice adds nothing. What runs after only refines the rows, so a failed
 * step is a warning, not a failed import.
 */
export async function importRows(account: AccountRow, rows: Array<v.InferOutput<typeof ImportRow>>, log: RequestLogger) {
  const mapped = rows.map((row) => {
    const amountMinor = decimalToMinor(row.amount, account.currency)
    if (amountMinor === null || !Number.isSafeInteger(amountMinor)) throw fail(400, "Couldn't read one of the amounts. Check the amount column and try again.")
    return { date: row.date, amountMinor, currency: account.currency, description: row.description, counterparty: row.counterparty || null }
  })
  const added = await insertTransactions(account, mapped, await householdRules(account.householdId))
  log.set({ import: { accountId: account.id, rows: rows.length, added } })
  const step = (name: string, run: () => Promise<unknown>) =>
    run().catch((error) => log.warn(`${name} failed`, { import: { failedStep: name, stepError: errorMessage(error) } }))
  if (added) {
    await step("Transfer detection", () => detectTransfers(account.householdId))
    await step("AI categories", () => categorizeWithAi(account.householdId, { accounts: eq(financialAccount.id, account.id) }, { limit: SYNC_LIMIT, log }))
    await step("Recurring detection", () => detectRecurring(account.householdId, [account.id]))
    await step("Snapshot backfill", () => backfillSnapshots(account.id))
  }
  return { added, skipped: rows.length - added }
}
