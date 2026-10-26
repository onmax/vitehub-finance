import { defineHandler } from "h3"
import * as v from "valibot"
import { decimalToMinor, isDate } from "../../../providers/dedupe"
import { fail, readValid } from "../../../utils/connections"
import { requireAccount } from "../../../utils/access"
import { requireMember } from "../../../utils/identity"
import { detectRecurring } from "../../../utils/recurring"
import { backfillSnapshots } from "../../../utils/snapshots"
import { householdRules, insertTransactions } from "../../../utils/sync"

const Row = v.object({
  date: v.pipe(v.string(), v.trim(), v.check(isDate, "Dates must be YYYY-MM-DD.")),
  amount: v.pipe(v.number(), v.finite()),
  description: v.pipe(v.string(), v.trim(), v.minLength(1, "Every row needs a description."), v.maxLength(500)),
  counterparty: v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(200)))),
})

const Body = v.object({ rows: v.pipe(v.array(Row), v.minLength(1, "No rows to import."), v.maxLength(5000, "Import at most 5000 rows at once.")) })

/**
 * Rows from a CSV (parsed in the browser) into an account. Rows already there (same date, amount, description, and
 * position among identical ones) are skipped, so importing the same file twice adds nothing.
 */
export default defineHandler(async (event) => {
  const who = await requireMember(event)
  const id = event.context.params?.id
  if (!id) throw fail(404, "No such account.")
  const account = await requireAccount(who, id, "edit")
  const { rows } = await readValid(event, Body)
  const mapped = rows.map((row, index) => {
    const amountMinor = decimalToMinor(row.amount, account.currency)
    if (amountMinor === null || !Number.isSafeInteger(amountMinor)) throw fail(400, `rows.${index}.amount: not a usable amount.`)
    return {
      date: row.date,
      amountMinor,
      currency: account.currency,
      description: row.description,
      counterparty: row.counterparty || null,
    }
  })
  const added = await insertTransactions(account, mapped, await householdRules(account.householdId))
  if (added) {
    await detectRecurring(account.householdId, [account.id]).catch((error) => console.error("[joxi] Recurring detection failed", error))
    await backfillSnapshots(account.id).catch((error) => console.error("[joxi] Snapshot backfill failed", error))
  }
  return { added, skipped: rows.length - added }
})
