import { eq } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import type { AccountKind } from "#shared/api"
import { financialAccount, householdSettings } from "../databases/config"
import { setManualHoldings } from "./holdings"
import type { Member } from "./identity"
import { recordSnapshot } from "./snapshots"

export interface ManualAccountInput {
  name: string
  kind: AccountKind
  currency: string
  balanceMinor?: number
  holdings?: Array<{ symbol: string; quantity: number }>
  visibility?: "private" | "household"
  householdPermission?: "view" | "edit"
  institution?: string | null
}

/**
 * A manual account owned by the caller (cash, a loan, a bank without PSD2): no connection; its balance is typed in or
 * imported. With `holdings` (silver bought in Revolut's app) it's worth what they're worth, priced every morning. Shared
 * or private as the household's setting for new accounts says, unless the input does. Returns its id.
 */
export async function createManualAccount(who: Member, input: ManualAccountInput) {
  const [settings] = await db
    .select({ shareNewAccounts: householdSettings.shareNewAccounts })
    .from(householdSettings)
    .where(eq(householdSettings.householdId, who.householdId))
    .limit(1)
  const id = crypto.randomUUID()
  const balanceMinor = input.balanceMinor ?? 0
  await db.insert(financialAccount).values({
    id,
    householdId: who.householdId,
    ownerId: who.userId,
    connectionId: null,
    name: input.name,
    institution: input.institution || null,
    kind: input.kind,
    currency: input.currency,
    balanceMinor,
    visibility: input.visibility ?? ((settings?.shareNewAccounts ?? true) ? "household" : "private"),
    householdPermission: input.householdPermission ?? "edit",
    balanceUpdatedAt: new Date(),
  })
  if (input.holdings) await setManualHoldings({ id, currency: input.currency }, input.holdings)
  else await recordSnapshot(id, balanceMinor)
  return id
}
