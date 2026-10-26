import { HTTPError } from "h3"
import { defineMcpTool } from "nitro-mcp-toolkit"
import * as v from "valibot"
import { baseCurrency } from "../../utils/accounts"
import { isIsoMonth, monthLabel, monthOf, todayIso } from "../../utils/dates"
import { requireMember } from "../../utils/identity"
import { categorySpending } from "../../utils/overview"
import { money, ScopeInput, text } from "../format"
import { toolInput } from "../schema"

export default defineMcpTool({
  name: "spending_by_category",
  title: "Spending by category",
  description:
    "What went out in a month, by category, largest first, in the household's currency. Transfers between the household's own accounts and excluded transactions don't count.",
  annotations: { readOnlyHint: true },
  inputSchema: toolInput(
    v.object({
      month: v.optional(v.pipe(v.string(), v.description("YYYY-MM; the current month by default."))),
      scope: ScopeInput,
    }),
  ),
  handler: async ({ month, scope }, event) => {
    const who = await requireMember(event)
    const wanted = month ?? monthOf(todayIso())
    if (!isIsoMonth(wanted)) throw new HTTPError({ status: 400, message: "month must be YYYY-MM." })
    const { currency, convert } = await baseCurrency(who)
    const categories = await categorySpending(who, scope ?? "household", wanted, convert)
    const totalMinor = categories.reduce((sum, row) => sum + row.amountMinor, 0)
    const body = categories.length
      ? `${monthLabel(wanted, "long")}: ${money(totalMinor, currency)} spent.\n${categories
          .map((row) => `- ${row.name}: ${money(row.amountMinor, currency)} (${Math.round((row.amountMinor / totalMinor) * 100)}%)`)
          .join("\n")}`
      : `No spending in ${monthLabel(wanted, "long")}.`
    return { content: text(body), structuredContent: { currency, month: wanted, totalMinor, categories } }
  },
})
