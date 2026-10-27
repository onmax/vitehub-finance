import { eq } from "drizzle-orm"
import { defineHandler } from "h3"
import { db } from "vite-hub/database/drizzle"
import { useRuntimeConfig } from "nitro/runtime-config"
import type { MeResponse } from "#shared/api"
import { householdSettings, organization, user as users } from "../databases/config"
import { aiAvailable } from "../utils/ai-categorize"
import { householdMembers, requireMember } from "../utils/identity"

export default defineHandler(async (event): Promise<MeResponse> => {
  const who = await requireMember(event)
  const [household] = await db
    .select({
      id: organization.id,
      name: organization.name,
      currency: householdSettings.currency,
      shareNewAccounts: householdSettings.shareNewAccounts,
      aiCategorize: householdSettings.aiCategorize,
    })
    .from(organization)
    .leftJoin(householdSettings, eq(householdSettings.householdId, organization.id))
    .where(eq(organization.id, who.householdId))
    .limit(1)
  const [person] = await db.select().from(users).where(eq(users.id, who.userId)).limit(1)
  const members = await householdMembers(who.householdId)
  return {
    user: { id: who.userId, name: who.name, email: who.email, image: person?.image ?? null },
    household: {
      id: who.householdId,
      name: household?.name ?? "Household",
      currency: household?.currency ?? "EUR",
      shareNewAccounts: household?.shareNewAccounts ?? true,
      aiCategorize: household?.aiCategorize ?? true,
    },
    role: who.role,
    members: members.map((row) => ({ ...row, role: row.role === "owner" ? "owner" : "member" })),
    email: Boolean(useRuntimeConfig().public.email),
    ai: aiAvailable(who),
  }
})
