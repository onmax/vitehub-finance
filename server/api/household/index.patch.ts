import { eq } from "drizzle-orm"
import { defineHandler } from "h3"
import * as v from "valibot"
import { db } from "vite-hub/database/drizzle"
import type { MeResponse } from "#shared/api"
import { householdSettings, organization } from "../../databases/config"
import { requireMember, requireOwner } from "../../utils/identity"
import { Currency, Name, readInput } from "../../utils/input"
import { refuseDemoPerson } from "../../demo/mode"
import { aiRouteFor } from "../../utils/ai-categorize"

const Body = v.object({
  name: v.optional(Name),
  currency: v.optional(Currency),
  shareNewAccounts: v.optional(v.boolean()),
  aiCategorize: v.optional(v.boolean()),
})

/**
 * The owner renames the household, changes the currency totals are shown in, the default for new accounts, or turns AI
 * categories off.
 */
export default defineHandler(async (event): Promise<MeResponse["household"]> => {
  refuseDemoPerson(await requireMember(event))
  const who = await requireOwner(event)
  const body = await readInput(event, Body)
  if (body.name) await db.update(organization).set({ name: body.name }).where(eq(organization.id, who.householdId))
  const settings = {
    ...(body.currency ? { currency: body.currency } : {}),
    ...(body.shareNewAccounts !== undefined ? { shareNewAccounts: body.shareNewAccounts } : {}),
    ...(body.aiCategorize !== undefined ? { aiCategorize: body.aiCategorize } : {}),
  }
  if (Object.keys(settings).length)
    await db
      .insert(householdSettings)
      .values({ householdId: who.householdId, ...settings })
      .onConflictDoUpdate({ target: householdSettings.householdId, set: settings })
  const [row] = await db
    .select({
      name: organization.name,
      currency: householdSettings.currency,
      shareNewAccounts: householdSettings.shareNewAccounts,
      aiCategorize: householdSettings.aiCategorize,
    })
    .from(organization)
    .leftJoin(householdSettings, eq(householdSettings.householdId, organization.id))
    .where(eq(organization.id, who.householdId))
    .limit(1)
  return {
    id: who.householdId,
    name: row?.name ?? "Household",
    currency: row?.currency ?? "EUR",
    shareNewAccounts: row?.shareNewAccounts ?? true,
    aiCategorize: row?.aiCategorize ?? true,
    aiRoute: (await aiRouteFor(who))?.route ?? null,
  }
})
