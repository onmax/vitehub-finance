import { and, desc, eq, gte, sql } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import { balanceSnapshot, financialAccount, transaction } from "../databases/config"
import { addDays } from "./dates"

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

/**
 * Daily balances for the days an account has transactions but no snapshot, worked backwards from today's balance: a
 * day closes at the next day's close minus what moved the next day. A freshly linked bank or an imported CSV then has a
 * chart at once instead of one that starts today. Days that already have a snapshot are left alone.
 */
export async function backfillSnapshots(accountId: string, days = 400) {
  const [account] = await db
    .select({ balanceMinor: financialAccount.balanceMinor })
    .from(financialAccount)
    .where(eq(financialAccount.id, accountId))
    .limit(1)
  if (!account) return
  const end = today()
  const since = addDays(end, -days)
  const moves = await db
    .select({ date: transaction.date, total: sql<number>`sum(${transaction.amountMinor})` })
    .from(transaction)
    .where(and(eq(transaction.accountId, accountId), gte(transaction.date, since)))
    .groupBy(transaction.date)
    .orderBy(desc(transaction.date))
  if (!moves.length) return
  const moved = new Map(moves.map((row) => [row.date, Number(row.total)]))
  const earliest = moves.at(-1)!.date
  const known = new Set(
    (
      await db
        .select({ date: balanceSnapshot.date })
        .from(balanceSnapshot)
        .where(and(eq(balanceSnapshot.accountId, accountId), gte(balanceSnapshot.date, earliest)))
    ).map((row) => row.date),
  )
  const rows: Array<{ accountId: string; date: string; balanceMinor: number }> = []
  let close = account.balanceMinor
  for (let day = end; day > earliest; ) {
    close -= moved.get(day) ?? 0
    day = addDays(day, -1)
    if (!known.has(day)) rows.push({ accountId, date: day, balanceMinor: close })
  }
  for (let index = 0; index < rows.length; index += 30)
    await db.insert(balanceSnapshot).values(rows.slice(index, index + 30)).onConflictDoNothing()
}
