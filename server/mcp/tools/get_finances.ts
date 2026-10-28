import { HTTPError } from "h3"
import { defineMcpTool } from "nitro-mcp-toolkit"
import * as v from "valibot"
import { requireMember } from "../../utils/identity"
import { ScopeInput } from "../format"
import { toolInput } from "../schema"
import { accountsView, accountView, forecastView, overviewView, recurringView, spendingView } from "../views"

export default defineMcpTool({
  name: "get_finances",
  title: "Household finances",
  description: [
    "Reads the household's finances, one view at a time. Start with view \"overview\" (the default).",
    "overview: net worth, this month's money in and out next to last month's, spending by category, recurring payments due in 14 days, the 8 latest transactions, staking, and connections that need attention.",
    "accounts: every account the user can see with kind, balance, owner, shared or private, and its id; archived ones with archived=true.",
    "account: one account by id, with its holdings, its staking (balances by state, identified rewards per month, principal moved), and its balance 180 days ago.",
    "spending: one month's spending by category with shares; month=YYYY-MM, the current month by default.",
    "recurring: subscriptions, bills, and recurring income with next dates and monthly cost, totals, and ways to save.",
    "forecast: the cash balance projected months=1..24 ahead (6 by default) with a likely range, the lowest point, each month, and the payments expected in the next 30 days.",
    "Totals are in the household's currency; each account's and payment's own amounts in its currency.",
  ].join(" "),
  annotations: { readOnlyHint: true },
  inputSchema: toolInput(
    v.object({
      view: v.optional(v.pipe(v.picklist(["overview", "accounts", "account", "spending", "recurring", "forecast"]), v.description("What to read; overview by default."))),
      account: v.optional(v.pipe(v.string(), v.description("For view account: the account id, from view accounts."))),
      month: v.optional(v.pipe(v.string(), v.description("For view spending: YYYY-MM; the current month by default."))),
      months: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(24), v.description("For view forecast: months ahead, 1 to 24; 6 by default."))),
      archived: v.optional(v.pipe(v.boolean(), v.description("For view accounts: include archived accounts."))),
      scope: ScopeInput,
    }),
  ),
  handler: async ({ view, account, month, months, archived, scope }, event) => {
    const who = await requireMember(event)
    const seen = scope ?? "household"
    switch (view ?? "overview") {
      case "accounts":
        return accountsView(who, seen, archived ?? false)
      case "account":
        if (!account) throw new HTTPError({ status: 400, message: "View account needs account: an id from view accounts." })
        return accountView(who, account)
      case "spending":
        return spendingView(who, seen, month)
      case "recurring":
        return recurringView(who, seen)
      case "forecast":
        return forecastView(who, seen, months)
      default:
        return overviewView(who, seen)
    }
  },
})
