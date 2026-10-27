import { eq } from "drizzle-orm"
import { defineHandler } from "h3"
import * as v from "valibot"
import { db } from "vite-hub/database/drizzle"
import type { AccountSummary } from "#shared/api"
import { financialAccount, householdSettings } from "../../databases/config"
import { accountSummary } from "../../utils/accounts"
import { requireMember } from "../../utils/identity"
import { setManualHoldings } from "../../utils/holdings"
import { Currency, Holdings, Kind, Minor, Name, Permission, readInput, Visibility } from "../../utils/input"
import { recordSnapshot } from "../../utils/snapshots"

const Body = v.object({
  name: Name,
  kind: Kind,
  currency: Currency,
  balanceMinor: v.optional(Minor, 0),
  holdings: v.optional(Holdings),
  visibility: v.optional(Visibility),
  householdPermission: v.optional(Permission),
  institution: v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(120)))),
})

/**
 * A manual account (cash, a loan, a bank without PSD2): no connection; its balance is typed in or imported. With
 * `holdings` (silver bought in Revolut's app) it's worth what they're worth, priced every morning.
 */
export default defineHandler(async (event): Promise<AccountSummary> => {
  const who = await requireMember(event)
  const body = await readInput(event, Body)
  const [settings] = await db
    .select({ shareNewAccounts: householdSettings.shareNewAccounts })
    .from(householdSettings)
    .where(eq(householdSettings.householdId, who.householdId))
    .limit(1)
  const id = crypto.randomUUID()
  await db.insert(financialAccount).values({
    id,
    householdId: who.householdId,
    ownerId: who.userId,
    connectionId: null,
    name: body.name,
    institution: body.institution || null,
    kind: body.kind,
    currency: body.currency,
    balanceMinor: body.balanceMinor,
    visibility: body.visibility ?? ((settings?.shareNewAccounts ?? true) ? "household" : "private"),
    householdPermission: body.householdPermission ?? "edit",
    balanceUpdatedAt: new Date(),
  })
  if (body.holdings) await setManualHoldings({ id, currency: body.currency }, body.holdings)
  else await recordSnapshot(id, body.balanceMinor)
  return (await accountSummary(who, id))!
})
