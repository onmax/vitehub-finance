import { defineMcpTool } from "nitro-mcp-toolkit"
import * as v from "valibot"
import { householdCurrency } from "../../utils/accounts"
import { requireMember } from "../../utils/identity"
import { searchTransactions } from "../../utils/transactions"
import { categoryNames, resolveCategory } from "../categories"
import { money, ScopeInput, text, transactionLine } from "../format"
import { toolInput } from "../schema"

const date = (what: string) => v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/), v.description(what)))

export default defineMcpTool({
  name: "search_transactions",
  title: "Search transactions",
  description:
    "Transactions on the accounts the user can see, newest first, each in its account's currency. Also returns the count and the money in and out over every match, not only this page, in the household's currency, without excluded transactions. Filter by text in the description, counterparty, or note; a date range; an account id from get_finances view accounts; a category id or name, or \"none\" for uncategorized; and direction. Pass nextCursor back as cursor for the next page.",
  annotations: { readOnlyHint: true },
  inputSchema: toolInput(
    v.object({
      q: v.optional(v.pipe(v.string(), v.maxLength(200), v.description("Text to find, case-insensitive: \"netflix\", \"rent\"."))),
      from: date("First date, YYYY-MM-DD, inclusive."),
      to: date("Last date, YYYY-MM-DD, inclusive."),
      account: v.optional(v.pipe(v.string(), v.description("Account id from get_finances view accounts."))),
      category: v.optional(v.pipe(v.string(), v.description("Category id or name, or \"none\" for uncategorized."))),
      direction: v.optional(v.pipe(v.picklist(["in", "out"]), v.description("in: money received. out: money spent."))),
      limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100), v.description("At most 100; 25 by default."))),
      cursor: v.optional(v.pipe(v.string(), v.description("nextCursor from the previous call."))),
      scope: ScopeInput,
    }),
  ),
  handler: async ({ category, limit, scope, ...filters }, event) => {
    const who = await requireMember(event)
    const names = await categoryNames(who)
    const page = await searchTransactions(who, {
      ...filters,
      scope: scope ?? "household",
      category: category ? await resolveCategory(who, category, names) : undefined,
      limit: limit ?? 25,
    })
    const currency = await householdCurrency(who.householdId)
    const { totals } = page
    const summary = `${totals.count} ${totals.count === 1 ? "match" : "matches"}: in ${money(totals.inMinor, currency)}, out ${money(totals.outMinor, currency)} (household currency, excluded rows not counted).`
    const lines = page.items.map((row) => transactionLine(row, names))
    const more = page.nextCursor ? `\nMore: pass cursor=${page.nextCursor}` : ""
    return {
      content: text([summary, ...lines].join("\n") + more),
      structuredContent: {
        currency,
        ...page,
        items: page.items.map((row) => ({ ...row, category: row.categoryId ? (names.get(row.categoryId) ?? null) : null })),
      },
    }
  },
})
