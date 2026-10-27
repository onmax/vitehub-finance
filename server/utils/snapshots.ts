import { and, desc, eq, gte, sql } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import { balanceSnapshot, financialAccount, transaction } from "../databases/config"
import { currencyDigits } from "#shared/money"
import { addDays } from "./dates"
import { quantityTimeline, valueTimeline, type CoinHistory } from "./holdings-history"
import { rates } from "./fx"
import { closingPrices } from "./prices"

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
 * day closes at the next day's close minus what moved the next day, back to the day before the first transaction. A
 * freshly linked bank or an imported CSV then has a chart at once instead of one that starts today. Days that already
 * have a snapshot are left alone.
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
        .where(and(eq(balanceSnapshot.accountId, accountId), gte(balanceSnapshot.date, addDays(earliest, -1))))
    ).map((row) => row.date),
  )
  const rows: Array<{ accountId: string; date: string; balanceMinor: number }> = []
  let close = account.balanceMinor
  for (let day = end; day >= earliest; ) {
    close -= moved.get(day) ?? 0
    day = addDays(day, -1)
    if (!known.has(day)) rows.push({ accountId, date: day, balanceMinor: close })
  }
  await insertMissing(rows)
}

/**
 * A holdings account's past days as the provider valued them (a broker's net asset value), in the account's currency at
 * today's ECB rate, for the days before today without a snapshot. Today's is the live value the sync just wrote.
 */
export async function backfillDailyValues(accountId: string, currency: string, values: Array<{ date: string; value: number; currency: string }>) {
  const past = values.filter((day) => day.date < today())
  if (!past.length) return 0
  // `rates` gives units of each currency per unit of `currency`; an unknown one counts 1:1, as in valueHoldings.
  const table = past.some((day) => day.currency !== currency) ? await rates(currency) : {}
  const scale = 10 ** currencyDigits(currency)
  const rows = past.map((day) => ({
    accountId,
    date: day.date,
    balanceMinor: Math.round((day.value / (day.currency === currency ? 1 : (table[day.currency] ?? 1))) * scale),
  }))
  await insertMissing(rows)
  return rows.length
}

// Three parameters a row: 30 rows stay under D1's 100.
async function insertMissing(rows: Array<{ accountId: string; date: string; balanceMinor: number }>) {
  for (let index = 0; index < rows.length; index += 30)
    await db.insert(balanceSnapshot).values(rows.slice(index, index + 30)).onConflictDoNothing()
}

/**
 * A holdings account's (a wallet's) daily value for the days it has no snapshot: what it held each day, walked back from
 * today's holdings through `history`, at the coins' closing price that day in the account's currency. Goes back a year,
 * as far as CoinGecko's keyless prices go. Snapshots syncs wrote are kept; prices are only fetched when a day is missing.
 */
export async function backfillHoldingSnapshots(
  accountId: string,
  currency: string,
  holdings: Array<{ symbol: string; quantity: number }>,
  history: CoinHistory,
) {
  const end = today()
  const timeline = quantityTimeline(holdings, history, end, addDays(end, -365))
  if (!timeline.length) return 0
  const known = new Set(
    (
      await db
        .select({ date: balanceSnapshot.date })
        .from(balanceSnapshot)
        .where(and(eq(balanceSnapshot.accountId, accountId), gte(balanceSnapshot.date, timeline[0]!.date)))
    ).map((row) => row.date),
  )
  const missing = timeline.filter((day) => !known.has(day.date))
  if (!missing.length) return 0
  const price = await closingPrices(Object.keys(missing[0]!.quantities), currency)
  const rows = valueTimeline(missing, price, currencyDigits(currency)).map((day) => ({ accountId, date: day.date, balanceMinor: day.valueMinor }))
  // Without prices (CoinGecko down, nothing cached) write nothing, not just the days worth 0: the next sync tries again.
  if (rows.length < missing.length) return 0
  await insertMissing(rows)
  return rows.length
}
