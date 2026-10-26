import { defineMcpTool } from "nitro-mcp-toolkit"
import * as v from "valibot"
import { requireMember } from "../../utils/identity"
import { overview } from "../../utils/overview"
import { money, ScopeInput, signed, text } from "../format"
import { toolInput } from "../schema"

export default defineMcpTool({
  name: "get_overview",
  title: "Overview",
  description:
    "Net worth, this month's money in and out next to last month's, this month's spending by category, recurring payments due in the next 14 days, the 8 latest transactions, and connections whose last sync failed or whose bank access ends within 14 days. Totals are in the household's currency; each transaction and payment is in its own.",
  annotations: { readOnlyHint: true },
  inputSchema: toolInput(v.object({ scope: ScopeInput })),
  handler: async ({ scope }, event) => {
    const who = await requireMember(event)
    const data = await overview(who, scope ?? "household")
    const c = data.currency
    const lines = [
      `Net worth: ${money(data.netWorthMinor, c)} across ${data.accountCount} ${data.accountCount === 1 ? "account" : "accounts"}.`,
      `${data.month.label}: in ${money(data.month.inMinor, c)}, out ${money(data.month.outMinor, c)} (last month: in ${money(data.month.previousInMinor, c)}, out ${money(data.month.previousOutMinor, c)}).`,
      data.spending.length
        ? `Spending this month: ${data.spending
            .slice(0, 8)
            .map((row) => `${row.name} ${money(row.amountMinor, c)}`)
            .join(", ")}.`
        : "No spending this month yet.",
      data.upcoming.length
        ? `Due in the next 14 days: ${data.upcoming.map((row) => `${row.name} ${signed(row.amountMinor, row.currency)} on ${row.nextDate}`).join(", ")}.`
        : "Nothing recurring due in the next 14 days.",
      ...(data.attention.length
        ? [
            `Needs attention: ${data.attention
              .map((row) => `${row.name} (${row.status}${row.consentExpiresAt ? `, consent until ${row.consentExpiresAt.slice(0, 10)}` : ""})`)
              .join(", ")}.`,
          ]
        : []),
      data.recent.length
        ? `Latest: ${data.recent.map((row) => `${row.date} ${row.counterparty ?? row.description} ${signed(row.amountMinor, row.currency)}`).join("; ")}.`
        : "No transactions yet.",
    ]
    return { content: text(lines.join("\n")), structuredContent: { ...data } }
  },
})
