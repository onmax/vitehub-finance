import { HTTPError } from "../../utils/http-error"
import { defineHandler } from "h3"
import type { BudgetsResponse } from "#shared/api"
import { scopeOf } from "../../utils/access"
import { listBudgets } from "../../utils/budgets"
import { isIsoMonth } from "../../utils/dates"
import { requireMember } from "../../utils/identity"

export default defineHandler(async (event): Promise<BudgetsResponse> => {
  const who = await requireMember(event)
  const month = event.url.searchParams.get("month") || undefined
  if (month && !isIsoMonth(month)) throw new HTTPError({ status: 400, statusText: "month must be YYYY-MM." })
  return listBudgets(who, scopeOf(event), month)
})
