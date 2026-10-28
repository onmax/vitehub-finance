import { HTTPError } from "h3"
import { defineTool } from "okmcp"
import * as v from "valibot"
import { refuseDemoPerson } from "../../demo/mode"
import { requireMember } from "../../utils/identity"
import { getTransaction, updateTransaction, type TransactionChange } from "../../utils/transactions"
import { categoryNames, resolveCategory } from "../categories"
import { ScopeInput, text, transactionLine } from "../format"
import { toolInput } from "../schema"

export default defineTool({
  name: "update_transaction",
  title: "Update a transaction",
  description:
    "Sets a transaction's category (by id or name) and/or its note, on an account the user may edit. Rules won't change a category set here. With applyToSimilar it also saves a household rule that matches the counterparty, or the description's first words, and gives the category to similar uncategorized transactions. An empty note removes it. Take ids from search_transactions. Only change what the user asked for or clearly agreed to.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: toolInput(
    v.object({
      id: v.pipe(v.string(), v.description("Transaction id from search_transactions.")),
      category: v.optional(v.pipe(v.string(), v.description("Category id, or its name (\"Groceries\")."))),
      note: v.optional(v.pipe(v.string(), v.maxLength(1000), v.description("A note to keep with the transaction; \"\" removes it."))),
      applyToSimilar: v.optional(v.pipe(v.boolean(), v.description("With category: also save a rule and categorize similar uncategorized transactions."))),
      scope: ScopeInput,
    }),
  ),
  handler: async ({ id, category, note, applyToSimilar, scope }, event) => {
    const who = await requireMember(event)
    // The demo is read-only for its people (server/demo/read-only.ts); /mcp isn't under /api/, so the tool checks.
    refuseDemoPerson(who)
    if (category === undefined && note === undefined) throw new HTTPError({ status: 400, message: "Pass a category, a note, or both." })
    if (!(await getTransaction(who, id, scope ?? "household"))) throw new HTTPError({ status: 404, message: `No transaction with id ${id}.` })
    const names = await categoryNames(who)
    const change: TransactionChange = {}
    if (category !== undefined) {
      const resolved = await resolveCategory(who, category, names)
      if (resolved === "none") throw new HTTPError({ status: 400, message: "category can't be \"none\". Pass a category id or name." })
      Object.assign(change, { categoryId: resolved, applyToSimilar: applyToSimilar ?? false })
    }
    if (note !== undefined) change.note = note.trim() || null
    const updated = await updateTransaction(who, id, change)
    const done = [
      ...(change.categoryId ? [`categorized as ${names.get(change.categoryId)}${applyToSimilar ? ", with a rule for similar ones" : ""}`] : []),
      ...(note !== undefined ? [change.note ? "note saved" : "note removed"] : []),
    ]
    return {
      content: text(`Updated (${done.join("; ")}):\n${transactionLine(updated, names)}`),
      structuredContent: { ...updated, category: updated.categoryId ? (names.get(updated.categoryId) ?? null) : null },
    }
  },
})
