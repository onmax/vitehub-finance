import { and, eq, gte, inArray, isNull } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import { category, financialAccount, transaction, user as users } from "../databases/config"
import { householdCurrency } from "./accounts"
import { addDays, todayIso } from "./dates"
import { converterTo } from "./fx"
import { looksLikeTransfer, pairTransfers } from "./transfers-core"

/** Far enough back to cover a first sync's year of history. */
const WINDOW_DAYS = 400

/** The household's transfer category, created when someone deleted it. */
export async function transferCategory(householdId: string) {
  const rows = await db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(and(eq(category.householdId, householdId), eq(category.kind, "transfer")))
  const found = rows.find((row) => row.name === "Transfers") ?? rows[0]
  if (found) return found.id
  const id = crypto.randomUUID()
  await db
    .insert(category)
    .values({ id, householdId, name: "Transfers", kind: "transfer", icon: "i-lucide-arrow-left-right", color: "neutral" })
  return id
}

/**
 * Marks moves between the household's own accounts as transfers, so they leave spending, income, budgets, and the
 * forecast: an outflow and the inflow it became on another account share a `transferId`, and rows that say they are
 * such a move (a currency exchange, a top-up, a broker deposit) get the transfer category on their own. Rows someone
 * categorized by hand are never touched. Runs after every sync and import; safe to run again.
 */
export async function detectTransfers(householdId: string) {
  const since = addDays(todayIso(), -WINDOW_DAYS)
  const transfers = await transferCategory(householdId)
  const rows = await db
    .select({
      id: transaction.id,
      accountId: transaction.accountId,
      ownerId: financialAccount.ownerId,
      ownerName: users.name,
      visibility: financialAccount.visibility,
      hidden: transaction.hidden,
      date: transaction.date,
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
      description: transaction.description,
      counterparty: transaction.counterparty,
      categoryId: transaction.categoryId,
    })
    .from(transaction)
    .innerJoin(financialAccount, eq(financialAccount.id, transaction.accountId))
    .innerJoin(users, eq(users.id, financialAccount.ownerId))
    .where(
      and(
        eq(transaction.householdId, householdId),
        eq(transaction.excluded, false),
        eq(transaction.categoryLocked, false),
        isNull(transaction.transferId),
        gte(transaction.date, since),
      ),
    )
  if (!rows.length) return { paired: 0, marked: 0 }

  // A hidden row pairs like a private account's: only with its owner's own accounts, so no one else's row turns into
  // a transfer because of it.
  const candidates = rows
    .filter((row) => row.amountMinor !== 0)
    .map((row) => ({ ...row, private: row.visibility === "private" || row.hidden }))
  const toBase = await converterTo(await householdCurrency(householdId))
  const pairs = pairTransfers(candidates, toBase)
  for (const pair of pairs) {
    await db
      .update(transaction)
      .set({ transferId: crypto.randomUUID(), categoryId: transfers })
      .where(inArray(transaction.id, [pair.out.id, pair.in.id]))
  }
  const paired = new Set(pairs.flatMap((pair) => [pair.out.id, pair.in.id]))
  const marked = candidates.filter((row) => !paired.has(row.id) && row.categoryId !== transfers && looksLikeTransfer(row))
  for (let index = 0; index < marked.length; index += 90)
    await db
      .update(transaction)
      .set({ categoryId: transfers })
      .where(inArray(transaction.id, marked.slice(index, index + 90).map((row) => row.id)))
  return { paired: pairs.length, marked: marked.length }
}

/** Unlinks a pair when someone says one side isn't a transfer; the other side keeps its category until they change it. */
export async function unpairTransfer(transferId: string) {
  await db.update(transaction).set({ transferId: null }).where(eq(transaction.transferId, transferId))
}
