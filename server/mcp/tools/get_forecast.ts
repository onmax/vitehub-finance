import { defineMcpTool } from "nitro-mcp-toolkit"
import * as v from "valibot"
import { forecast } from "../../utils/forecast"
import { requireMember } from "../../utils/identity"
import { money, ScopeInput, signed, text } from "../format"
import { toolInput } from "../schema"

export default defineMcpTool({
  name: "get_forecast",
  title: "Cash-flow forecast",
  description:
    "Projects the cash balance (checking, savings, cash, and credit accounts) month by month: recurring income and charges when they fall due, plus the usual variable spending from the last 3 full months. Also the average monthly income and how much the household saves a month. Household currency.",
  annotations: { readOnlyHint: true },
  inputSchema: toolInput(
    v.object({
      months: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(24), v.description("Months ahead, 1 to 24; 6 by default."))),
      scope: ScopeInput,
    }),
  ),
  handler: async ({ months, scope }, event) => {
    const who = await requireMember(event)
    const data = await forecast(who, scope ?? "household", months ?? 6)
    const c = data.currency
    const lines = [
      `Today: ${money(data.startMinor, c)}. Usual variable spending ${money(data.variableMonthlyMinor, c)}/month; average income ${money(data.averageMonthlyIncomeMinor, c)}/month; saving ${signed(data.monthlySavingsMinor, c)}/month.`,
      ...data.months.map(
        (row) =>
          `- End of ${row.label}: ${money(row.balanceMinor, c)} (recurring in ${money(row.recurringInMinor, c)}, recurring out ${money(row.recurringOutMinor, c)}, variable ${money(row.variableOutMinor, c)})`,
      ),
    ]
    return { content: text(lines.join("\n")), structuredContent: { ...data } }
  },
})
