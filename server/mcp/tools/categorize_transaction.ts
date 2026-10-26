import { HTTPError } from "h3"
import { defineMcpTool } from "nitro-mcp-toolkit"
import * as v from "valibot"
import { requireMember } from "../../utils/identity"
import { getTransaction, updateTransaction } from "../../utils/transactions"
import { categoryNames, resolveCategory } from "../categories"
import { ScopeInput, text, transactionLine } from "../format"
import { toolInput } from "../schema"

export default defineMcpTool({
  name: "categorize_transaction",
  title: "Categorize a transaction",
  description:
    "Sets a transaction's category (by id or name) on an account the user may edit; rules won't change it afterwards. With applyToSimilar it also saves a rule (the counterparty, or the description's first words) and gives the category to similar uncategorized transactions. Use ids from search_transactions. Only categorize what the user asked for or clearly agreed to.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: toolInput(
    v.object({
      id: v.pipe(v.string(), v.description("Transaction id from search_transactions.")),
      categoryId: v.pipe(v.string(), v.description("Category id, or its name (\"Groceries\").")),
      applyToSimilar: v.optional(v.pipe(v.boolean(), v.description("Also save a rule and categorize similar uncategorized transactions."))),
      scope: ScopeInput,
    }),
  ),
  handler: async ({ id, categoryId, applyToSimilar, scope }, event) => {
    const who = await requireMember(event)
    if (!(await getTransaction(who, id, scope ?? "household"))) throw new HTTPError({ status: 404, message: `No transaction with id ${id}.` })
    const names = await categoryNames(who)
    const resolved = await resolveCategory(who, categoryId, names)
    if (resolved === "none") throw new HTTPError({ status: 400, message: "Pass a category." })
    const updated = await updateTransaction(who, id, { categoryId: resolved, applyToSimilar: applyToSimilar ?? false })
    return {
      content: text(`Categorized as ${names.get(resolved)}${applyToSimilar ? ", with a rule for similar ones" : ""}:\n${transactionLine(updated, names)}`),
      structuredContent: { ...updated, category: names.get(resolved) ?? null },
    }
  },
})
