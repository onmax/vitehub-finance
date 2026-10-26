import { defineMcpTool } from "nitro-mcp-toolkit"
import * as v from "valibot"
import { requireMember } from "../../utils/identity"
import { recurringOverview } from "../../utils/recurring"
import { money, recurringLine, ScopeInput, text } from "../format"
import { toolInput } from "../schema"

export default defineMcpTool({
  name: "list_recurring",
  title: "Recurring payments",
  description:
    "Subscriptions, bills, and income that repeat weekly, monthly, quarterly, or yearly, detected from the transactions. Each has its amount in its account's currency, cadence, next date (YYYY-MM-DD), and monthly cost in the household's currency. Also returns totals per month and year, and ways to save with the yearly saving of each: price increases, the same subscription paid by two members, and large subscriptions. Dismissed ones come last.",
  annotations: { readOnlyHint: true },
  inputSchema: toolInput(v.object({ scope: ScopeInput })),
  handler: async ({ scope }, event) => {
    const who = await requireMember(event)
    const data = await recurringOverview(who, scope ?? "household")
    const c = data.currency
    const lines = [
      `Recurring charges: ${money(data.totals.monthlyOutMinor, c)}/month (${money(data.totals.yearlyOutMinor, c)}/year); recurring income ${money(data.totals.monthlyInMinor, c)}/month.`,
      ...data.items.map((row) => recurringLine(row, c)),
      ...(data.insights.length
        ? ["Ways to save:", ...data.insights.map((row) => `- ${row.title}. ${row.detail} (saves ${money(row.savingsMinor, c)}/year)`)]
        : []),
    ]
    return { content: text(data.items.length ? lines.join("\n") : "No recurring payments found yet. They appear once a payment repeats in the transactions."), structuredContent: { ...data } }
  },
})
