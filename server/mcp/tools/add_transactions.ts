import { HTTPError } from "h3"
import { useLogger } from "evlog/nitro/v3"
import { defineTool } from "okmcp"
import * as v from "valibot"
import { refuseDemoPerson } from "../../demo/mode"
import { accountSummary } from "../../utils/accounts"
import { requireAccount } from "../../utils/access"
import { requireMember } from "../../utils/identity"
import { ImportRows, importRows } from "../../utils/import"
import { Currency, Name } from "../../utils/input"
import { createManualAccount } from "../../utils/manual-accounts"
import { money, text } from "../format"
import { toolInput } from "../schema"

// Bounded per call so one request stays small; call again for more.
const ROWS_PER_CALL = 1000

// What clients see. JSON Schema can't say "a real calendar date" or "upper-case it", so each of these is followed by the
// app's own validators (server/utils/import.ts, input.ts), which okmcp runs before the handler (see ../schema.ts).
const Row = v.object({
  date: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/), v.description("YYYY-MM-DD.")),
  amount: v.pipe(v.number(), v.description("In the account's currency, major units; negative for money out.")),
  description: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  counterparty: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(200)))),
})
const NewAccount = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(120), v.description("Its name: \"Trade Republic\".")),
  currency: v.pipe(v.string(), v.regex(/^[A-Za-z]{3}$/), v.description("ISO 4217: EUR.")),
  kind: v.pipe(v.picklist(["checking", "savings", "credit", "investment", "crypto", "cash", "loan", "other"]), v.description("What kind of account.")),
  institution: v.optional(v.pipe(v.string(), v.maxLength(120), v.description("The bank or platform."))),
})
const Checked = v.object({ ...NewAccount.entries, name: Name, currency: Currency })

export default defineTool({
  name: "add_transactions",
  title: "Add transactions",
  description:
    "Adds transactions the user gave you, such as rows read from a bank or broker statement the app can't import, to an account the user may edit, or to a new manual account it creates for them (pass newAccount instead of account). Amounts are in the account's currency, major units, negative for money out. Rows already in the account (same date, amount, and description) are skipped, so sending a statement twice adds nothing. Household rules, transfer detection, and recurring detection run on the new rows. Only add what the user asked for.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: toolInput(
    v.object({
      account: v.optional(v.pipe(v.string(), v.description("Account id from get_finances view accounts. Leave out with newAccount."))),
      newAccount: v.optional(v.pipe(NewAccount, v.description("Create a manual account owned by the user and add the rows to it."), Checked)),
      rows: v.pipe(
        v.array(Row),
        v.minLength(1),
        v.maxLength(ROWS_PER_CALL),
        v.description(`The transactions, at most ${ROWS_PER_CALL} per call: date (YYYY-MM-DD), amount, description, counterparty.`),
        ImportRows,
      ),
    }),
  ),
  handler: async ({ account: accountId, newAccount, rows }, event) => {
    const who = await requireMember(event)
    // The demo is read-only for its people (server/demo/read-only.ts); /mcp isn't under /api/, so the tool checks.
    refuseDemoPerson(who)
    if (Boolean(accountId) === Boolean(newAccount)) throw new HTTPError({ status: 400, message: "Pass either account (an existing id) or newAccount, not both." })
    let id = accountId
    if (newAccount) id = await createManualAccount(who, { ...newAccount, institution: newAccount.institution?.trim() || null })
    const account = await requireAccount(who, id!, "edit")
    const log = useLogger(event)
    log.set({ action: "agent-import" })
    const { added, skipped } = await importRows(account, rows, log)
    const summary = (await accountSummary(who, id!))!
    return {
      content: text(
        `${newAccount ? `Created the manual account ${summary.name} (id=${id}). ` : ""}Added ${added} ${added === 1 ? "transaction" : "transactions"} to ${summary.name}${skipped ? `; skipped ${skipped} already there` : ""}. Its balance is ${money(summary.balanceMinor, summary.currency)}${newAccount ? ": a manual account's balance is what the user sets in the app, not the sum of its rows" : ""}.`,
      ),
      structuredContent: { account: summary, added, skipped },
    }
  },
})
