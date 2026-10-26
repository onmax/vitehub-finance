import { eq } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import type { MoneyFlow } from "#shared/api"
import { category } from "../databases/config"
import type { Scope } from "./access"
import { baseCurrency } from "./accounts"
import { monthEnd, monthOf, monthStart, todayIso } from "./dates"
import { buildFlow, type CategoryInfo } from "./flow-core"
import type { Member } from "./identity"
import { flowByCategory, movedOut } from "./transactions"

/** A month's money flow over the caller's visible accounts (server/utils/flow-core.ts has the rules). */
export async function moneyFlow(who: Member, scope: Scope, month = monthOf(todayIso())): Promise<MoneyFlow> {
  const { currency, convert } = await baseCurrency(who)
  const range = { scope, from: monthStart(month), to: monthEnd(month) }
  const totals = await flowByCategory(who, range, convert)
  const rows = await db.select().from(category).where(eq(category.householdId, who.householdId))
  const categories = new Map<string, CategoryInfo>(rows.map((row) => [row.id, row]))
  const flow = buildFlow(
    [...totals].map(([categoryId, sums]) => ({ categoryId, ...sums })),
    categories,
  )
  return { currency, month, from: range.from, to: range.to, ...flow, movedMinor: await movedOut(who, range, convert) }
}
