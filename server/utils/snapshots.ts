import { sql } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import { balanceSnapshot } from "../databases/config"

export const today = () => new Date().toISOString().slice(0, 10)

/** Today's balance for an account; a later write the same day replaces it. Feeds the net worth chart. */
export async function recordSnapshot(accountId: string, balanceMinor: number, date = today()) {
  await db
    .insert(balanceSnapshot)
    .values({ accountId, date, balanceMinor })
    .onConflictDoUpdate({
      target: [balanceSnapshot.accountId, balanceSnapshot.date],
      set: { balanceMinor: sql`excluded.balance_minor` },
    })
}
