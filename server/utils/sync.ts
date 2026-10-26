import { and, eq } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import { connection, financialAccount, holding, householdSettings, rule, syncRun, transaction } from "../databases/config"
import { categorize, dedupeKeys, isDate, type Rule } from "../providers/dedupe"
import { providerFor } from "../providers/index"
import { ProviderError, type ProviderAccount, type ProviderHolding, type ProviderTransaction } from "../providers/types"
import { bankConfig, errorMessage } from "./connections"
import { seal, unseal } from "./crypto"
import { valueCoinTransactions, valueHoldings } from "./prices"
import { detectRecurring } from "./recurring"
import { backfillSnapshots, recordSnapshot } from "./snapshots"
import { detectTransfers, transferCategory } from "./transfers"

export type SyncTrigger = "schedule" | "manual" | "link"

type AccountRow = typeof financialAccount.$inferSelect

const DAY = 24 * 60 * 60 * 1000
const dayString = (time: number) => new Date(time).toISOString().slice(0, 10)

// D1 binds at most 100 parameters per statement: a transaction row binds up to 14 (defaults included), a holding 7.
const TRANSACTION_CHUNK = 7
const HOLDING_CHUNK = 12

export async function householdRules(householdId: string): Promise<Rule[]> {
  return db.select({ match: rule.match, categoryId: rule.categoryId }).from(rule).where(eq(rule.householdId, householdId))
}

/**
 * Inserts the rows this account doesn't have yet (by dedupe key) with categories from the rules, and returns how many were
 * new. A row the provider calls a transfer gets `transferCategoryId` when no rule matches. Existing rows, and so
 * hand-picked categories, are never touched.
 */
export async function insertTransactions(
  account: Pick<AccountRow, "id" | "householdId">,
  rows: ProviderTransaction[],
  rules: Rule[],
  transferCategoryId?: string,
) {
  const valid = rows.filter((row) => isDate(row.date) && Number.isSafeInteger(row.amountMinor))
  const computed = await dedupeKeys(valid)
  const keyed = valid.map((row, index) => ({ ...row, dedupeKey: row.dedupeKey ?? computed[index]! }))
  // The same key twice in one batch (a bank repeating an id) would abort the whole insert otherwise.
  const unique = [...new Map(keyed.map((row) => [row.dedupeKey, row] as const)).values()]
  let added = 0
  for (let index = 0; index < unique.length; index += TRANSACTION_CHUNK) {
    const values = unique.slice(index, index + TRANSACTION_CHUNK).map((row) => ({
      id: crypto.randomUUID(),
      householdId: account.householdId,
      accountId: account.id,
      // Undefined, not null: drizzle writes a literal NULL instead of binding a parameter.
      externalId: row.externalId || undefined,
      dedupeKey: row.dedupeKey,
      date: row.date,
      amountMinor: row.amountMinor,
      currency: row.currency,
      description: row.description.slice(0, 500),
      counterparty: row.counterparty || undefined,
      categoryId: categorize(rules, row) ?? (row.transfer ? transferCategoryId : undefined),
    }))
    const inserted = await db
      .insert(transaction)
      .values(values)
      .onConflictDoNothing({ target: [transaction.accountId, transaction.dedupeKey] })
      .returning({ id: transaction.id })
    added += inserted.length
  }
  return added
}

type PricedHolding = ProviderHolding & { priceMinor: number | null; valueMinor: number }

async function replaceHoldings(accountId: string, holdings: PricedHolding[]) {
  await db.delete(holding).where(eq(holding.accountId, accountId))
  const values = holdings.map((entry) => ({
    id: crypto.randomUUID(),
    accountId,
    symbol: entry.symbol.toUpperCase(),
    name: entry.name ?? undefined,
    quantity: entry.quantity,
    priceMinor: entry.priceMinor ?? undefined,
    valueMinor: entry.valueMinor,
  }))
  for (let index = 0; index < values.length; index += HOLDING_CHUNK)
    await db.insert(holding).values(values.slice(index, index + HOLDING_CHUNK)).onConflictDoNothing()
}

interface Context {
  row: typeof connection.$inferSelect
  household: { currency: string; shareNewAccounts: boolean }
  rules: Rule[]
  existing: Map<string, AccountRow>
  /** Exchanges and wallets have one account, named after the connection people named. */
  single: boolean
}

/** One provider account into the database: the account row, its holdings, balance, snapshot, and new transactions. */
async function applyAccount(context: Context, remote: ProviderAccount) {
  const { row, household } = context
  const hasHoldings = remote.holdings !== undefined
  const holdings = hasHoldings ? await valueHoldings(remote.holdings!, household.currency) : []
  // A crypto account is worth its holdings in the household's currency.
  const currency = hasHoldings ? household.currency : remote.currency
  const balance = hasHoldings ? holdings.reduce((sum, entry) => sum + entry.valueMinor, 0) : remote.balanceMinor
  const now = new Date()

  let account = context.existing.get(remote.externalId)
  if (!account) {
    const [created] = await db
      .insert(financialAccount)
      .values({
        id: crypto.randomUUID(),
        householdId: row.householdId,
        ownerId: row.ownerId,
        connectionId: row.id,
        externalId: remote.externalId,
        name: context.single ? row.name : remote.name,
        institution: remote.institution ?? row.institution,
        kind: remote.kind,
        currency,
        balanceMinor: balance ?? 0,
        iban: remote.iban ?? null,
        visibility: household.shareNewAccounts ? "household" : "private",
        balanceUpdatedAt: balance === undefined ? null : now,
      })
      .returning()
    account = created!
    context.existing.set(remote.externalId, account)
  } else {
    // Names and kinds may have been edited by hand; the provider only owns the numbers.
    await db
      .update(financialAccount)
      .set({
        currency,
        iban: remote.iban ?? account.iban,
        institution: account.institution ?? remote.institution ?? row.institution,
        ...(balance === undefined ? {} : { balanceMinor: balance, balanceUpdatedAt: now }),
      })
      .where(eq(financialAccount.id, account.id))
  }
  if (hasHoldings) await replaceHoldings(account.id, holdings)
  await recordSnapshot(account.id, balance ?? account.balanceMinor)
  // A wallet's coin movements, valued in the account's currency. They never set its balance: the holdings do.
  const coins = hasHoldings && remote.coinTransactions?.length ? await valueCoinTransactions(remote.coinTransactions, currency) : []
  const rows = [...(remote.transactions ?? []), ...coins]
  const transfers = rows.some((entry) => entry.transfer) ? await transferCategory(row.householdId) : undefined
  return {
    accountId: account.id,
    hasHoldings,
    added: rows.length ? await insertTransactions(account, rows, context.rules, transfers) : 0,
  }
}

const retryable = (error: unknown) => !(error instanceof ProviderError) || error.code === "unavailable"

/**
 * Runs one connection: fetch from the provider, write accounts, holdings, balances, and new transactions, then record
 * the run. Failures land in `sync_run` and the connection's `lastError`; only transient ones (a bank or network down)
 * are rethrown, so a Queue retries them while an expired consent waits for its owner.
 */
export async function syncConnection(connectionId: string, trigger: SyncTrigger) {
  const [row] = await db.select().from(connection).where(eq(connection.id, connectionId)).limit(1)
  // Deleted meanwhile, still waiting for its bank, or removed: nothing to do.
  if (!row || row.provider === "manual" || row.status === "pending" || row.status === "revoked") return { added: 0, error: null }

  const runId = crypto.randomUUID()
  await db.insert(syncRun).values({ id: runId, connectionId, trigger, status: "running" })
  const started = Date.now()
  try {
    const credentials = await unseal<unknown>(row.credentials).catch(() => {
      throw new ProviderError("expired", "The stored credentials can't be read (was FINANCE_ENCRYPTION_KEY changed?). Reconnect.")
    })
    if (!credentials) throw new ProviderError("expired", "This connection has no credentials. Reconnect it.")
    const initial = trigger === "link" || !row.lastSyncedAt
    const since = initial ? dayString(started - 365 * DAY) : dayString(row.lastSyncedAt!.getTime() - 10 * DAY)
    const provider = providerFor(row.provider, { enableBanking: bankConfig() })
    const result = await provider(credentials, { since, initial })

    const [settings] = await db.select().from(householdSettings).where(eq(householdSettings.householdId, row.householdId)).limit(1)
    const existingRows = await db.select().from(financialAccount).where(eq(financialAccount.connectionId, row.id))
    const context: Context = {
      row,
      household: { currency: settings?.currency ?? "EUR", shareNewAccounts: settings?.shareNewAccounts ?? true },
      rules: await householdRules(row.householdId),
      existing: new Map(existingRows.filter((account) => account.externalId).map((account) => [account.externalId!, account] as const)),
      single: row.provider !== "enable_banking" && result.accounts.length === 1,
    }

    let added = 0
    const touched: string[] = []
    // Accounts whose balance is the transactions' sum; a holdings account's past value depends on past prices instead.
    const backfill: string[] = []
    const failures: string[] = []
    // Each account on its own: one failing never loses what the others brought.
    for (const remote of result.accounts) {
      if (remote.error) {
        failures.push(`${remote.name}: ${remote.error}`)
        continue
      }
      try {
        const outcome = await applyAccount(context, remote)
        added += outcome.added
        touched.push(outcome.accountId)
        if (!outcome.hasHoldings) backfill.push(outcome.accountId)
      } catch (error) {
        console.error(`[finance] Sync of ${row.id} failed for account ${remote.externalId}`, error)
        failures.push(`${remote.name}: ${errorMessage(error)}`)
      }
    }
    if (!touched.length && failures.length) throw new Error(failures.join("; "))

    // Transfers first: a move between two accounts often arrives with the second account's sync.
    if (touched.length) await detectTransfers(row.householdId).catch((error) => console.error("[finance] Transfer detection failed", error))
    if (touched.length)
      await detectRecurring(row.householdId, touched).catch((error) => console.error("[finance] Recurring detection failed", error))
    // The first sync brings a year of history: give its accounts a balance chart from it.
    if (initial)
      for (const accountId of backfill)
        await backfillSnapshots(accountId).catch((error) => console.error("[finance] Snapshot backfill failed", error))

    const partial = failures.length ? `${failures.length} of ${result.accounts.length} accounts failed: ${failures.join("; ")}` : null
    await db
      .update(connection)
      .set({
        status: "active",
        lastSyncedAt: new Date(),
        lastError: partial,
        ...(result.consentExpiresAt === undefined ? {} : { consentExpiresAt: result.consentExpiresAt }),
        ...(result.credentials === undefined ? {} : { credentials: await seal(result.credentials) }),
      })
      .where(eq(connection.id, row.id))
    await db
      .update(syncRun)
      .set({ status: "succeeded", added, error: partial, finishedAt: new Date() })
      .where(eq(syncRun.id, runId))
    return { added, error: partial }
  } catch (error) {
    const message = errorMessage(error).slice(0, 500)
    const expired = error instanceof ProviderError && error.code === "expired"
    if (!(error instanceof ProviderError)) console.error(`[finance] Sync of ${row.id} failed`, error)
    await db.update(syncRun).set({ status: "failed", error: message, finishedAt: new Date() }).where(eq(syncRun.id, runId))
    await db
      .update(connection)
      .set({ status: expired ? "expired" : "error", lastError: message })
      .where(eq(connection.id, row.id))
    if (retryable(error)) throw error
    return { added: 0, error: message }
  }
}

/**
 * Accounts by provider id, then IBAN and currency: after a reconnect a bank hands out new ids, and the history should
 * stay. Currency matters because some banks (Revolut) put every currency account behind one IBAN.
 */
export async function matchReconnectedAccounts(connectionId: string, accounts: Array<{ uid: string; iban: string | null; currency: string }>) {
  const existing = await db.select().from(financialAccount).where(eq(financialAccount.connectionId, connectionId))
  const uids = new Set(accounts.map((account) => account.uid))
  const claimed = new Set(existing.filter((row) => row.externalId && uids.has(row.externalId)).map((row) => row.id))
  for (const account of accounts) {
    if (existing.some((row) => row.externalId === account.uid) || !account.iban) continue
    const normalized = account.iban.replace(/\s+/g, "").toUpperCase()
    const match = existing.find(
      (row) => !claimed.has(row.id) && row.iban?.replace(/\s+/g, "").toUpperCase() === normalized && row.currency === account.currency,
    )
    if (!match) continue
    claimed.add(match.id)
    await db
      .update(financialAccount)
      .set({ externalId: account.uid })
      .where(and(eq(financialAccount.id, match.id), eq(financialAccount.connectionId, connectionId)))
  }
}
