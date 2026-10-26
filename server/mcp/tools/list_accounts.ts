import { defineMcpTool } from "nitro-mcp-toolkit"
import * as v from "valibot"
import { listAccounts } from "../../utils/accounts"
import { householdCurrency } from "../../utils/accounts"
import { requireMember } from "../../utils/identity"
import { accountLine, money, ScopeInput, text } from "../format"
import { toolInput } from "../schema"

export default defineMcpTool({
  name: "list_accounts",
  title: "List accounts",
  description:
    "The accounts the user can see, with kind (checking, savings, credit, investment, crypto, cash, loan), balance in the account's currency and in the household's when they differ, owner, whether it's shared or private, and the id to pass to search_transactions. Ends with the net worth of the non-archived accounts that count toward it.",
  annotations: { readOnlyHint: true },
  inputSchema: toolInput(
    v.object({
      scope: ScopeInput,
      archived: v.optional(v.pipe(v.boolean(), v.description("Include archived accounts."))),
    }),
  ),
  handler: async ({ scope, archived }, event) => {
    const who = await requireMember(event)
    const [accounts, currency] = await Promise.all([
      listAccounts(who, { scope: scope ?? "household", archived: archived ?? false }),
      householdCurrency(who.householdId),
    ])
    const total = accounts.filter((row) => row.includeInNetWorth && !row.archived).reduce((sum, row) => sum + row.balanceBaseMinor, 0)
    const body = accounts.length
      ? `${accounts.map((row) => accountLine(row, currency)).join("\n")}\nNet worth: ${money(total, currency)}.`
      : "No accounts the user can see yet. They add them in the browser by connecting a bank, exchange, wallet, or broker, or by adding a manual account."
    return { content: text(body), structuredContent: { currency, accounts } }
  },
})
