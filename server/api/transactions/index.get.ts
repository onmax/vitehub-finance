import { defineHandler } from "h3"
import type { TransactionPage } from "#shared/api"
import { scopeOf } from "../../utils/access"
import { requireMember } from "../../utils/identity"
import { searchTransactions } from "../../utils/transactions"

/** Visible transactions, newest first, a page at a time (`cursor`), with totals over every match. */
export default defineHandler(async (event): Promise<TransactionPage> => {
  const who = await requireMember(event)
  const query = event.url.searchParams
  const text = (name: string) => query.get(name)?.trim() || undefined
  const direction = query.get("direction")
  return searchTransactions(who, {
    scope: scopeOf(event),
    q: text("q"),
    account: text("account"),
    category: text("category"),
    from: text("from"),
    to: text("to"),
    direction: direction === "in" || direction === "out" ? direction : undefined,
    cursor: text("cursor"),
    limit: query.has("limit") ? Number.parseInt(query.get("limit")!, 10) : undefined,
  })
})
