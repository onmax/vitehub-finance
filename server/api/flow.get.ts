import { defineHandler, HTTPError } from "h3"
import type { MoneyFlow } from "#shared/api"
import { scopeOf } from "../utils/access"
import { isIsoMonth } from "../utils/dates"
import { moneyFlow } from "../utils/flow"
import { requireMember } from "../utils/identity"

/** A month's money in by source and out by category (`?month=YYYY-MM`, default this month; `scope`). */
export default defineHandler(async (event): Promise<MoneyFlow> => {
  const who = await requireMember(event)
  const month = event.url.searchParams.get("month") || undefined
  if (month && !isIsoMonth(month)) throw new HTTPError({ status: 400, statusText: "month must be YYYY-MM." })
  return moneyFlow(who, scopeOf(event), month)
})
