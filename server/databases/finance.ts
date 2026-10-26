// ViteHub Finance's own tables. Money is stored in minor units (cents) as integers, in the row's own currency.
// Every row carries its household; every account carries its owner, and only the owner sees a private account.
import { sql } from "drizzle-orm"
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { organization, user } from "./auth"

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).default(now).notNull()
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .default(now)
    .$onUpdate(() => new Date())
    .notNull()
const householdId = () =>
  text("household_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" })
const ownerId = () =>
  text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })

/** Household-wide settings that Better Auth's organization doesn't hold. */
export const householdSettings = sqliteTable("household_settings", {
  householdId: text("household_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  currency: text("currency").notNull().default("EUR"),
  // New accounts start shared with the household (true) or private to whoever connects them (false).
  shareNewAccounts: integer("share_new_accounts", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

/**
 * Where accounts come from: a bank session (Enable Banking), an exchange key, a wallet address, a broker's read-only
 * token (Interactive Brokers' Flex Web Service), or `manual` for
 * accounts someone types in or imports from CSV. `credentials` is AES-GCM ciphertext (server/utils/crypto.ts).
 */
export const connection = sqliteTable(
  "connection",
  {
    id: text("id").primaryKey(),
    householdId: householdId(),
    ownerId: ownerId(),
    provider: text("provider", {
      enum: ["enable_banking", "kraken", "binance", "coinbase", "bitcoin", "ethereum", "solana", "xrpl", "nimiq", "ibkr", "manual"],
    }).notNull(),
    name: text("name").notNull(),
    institution: text("institution"),
    country: text("country"),
    status: text("status", { enum: ["pending", "active", "expired", "error", "revoked"] })
      .notNull()
      .default("pending"),
    credentials: text("credentials"),
    // The provider's id for this link: an Enable Banking session, an exchange key's label, a wallet address.
    externalId: text("external_id"),
    consentExpiresAt: integer("consent_expires_at", { mode: "timestamp_ms" }),
    // The last reminder sent about an expiring consent, so the daily check sends one per window.
    remindedAt: integer("reminded_at", { mode: "timestamp_ms" }),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("connection_household_idx").on(table.householdId)],
)

export const ACCOUNT_KINDS = ["checking", "savings", "credit", "investment", "crypto", "cash", "loan", "other"] as const

export const financialAccount = sqliteTable(
  "financial_account",
  {
    id: text("id").primaryKey(),
    householdId: householdId(),
    ownerId: ownerId(),
    connectionId: text("connection_id").references(() => connection.id, { onDelete: "set null" }),
    // The provider's id for the account, unique within its connection.
    externalId: text("external_id"),
    name: text("name").notNull(),
    institution: text("institution"),
    kind: text("kind", { enum: ACCOUNT_KINDS }).notNull().default("checking"),
    currency: text("currency").notNull().default("EUR"),
    balanceMinor: integer("balance_minor").notNull().default(0),
    iban: text("iban"),
    // `private`: only the owner sees it. `household`: every member sees it and its transactions.
    visibility: text("visibility", { enum: ["private", "household"] })
      .notNull()
      .default("household"),
    // What other members may do with a shared account: look (`view`) or also categorize and edit (`edit`).
    householdPermission: text("household_permission", { enum: ["view", "edit"] })
      .notNull()
      .default("edit"),
    includeInNetWorth: integer("include_in_net_worth", { mode: "boolean" }).notNull().default(true),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    balanceUpdatedAt: integer("balance_updated_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("financial_account_household_idx").on(table.householdId),
    uniqueIndex("financial_account_external_idx").on(table.connectionId, table.externalId),
  ],
)

/** What a crypto or investment account holds. Its balance is the sum of the holdings' values. */
export const holding = sqliteTable(
  "holding",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    name: text("name"),
    quantity: real("quantity").notNull(),
    // Per unit and in total, in the account's currency, at `updatedAt`.
    priceMinor: integer("price_minor"),
    valueMinor: integer("value_minor").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("holding_account_symbol_idx").on(table.accountId, table.symbol)],
)

/** One balance per account per day, for the net worth chart. */
export const balanceSnapshot = sqliteTable(
  "balance_snapshot",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    balanceMinor: integer("balance_minor").notNull(),
  },
  (table) => [uniqueIndex("balance_snapshot_account_date_idx").on(table.accountId, table.date)],
)

export const CATEGORY_KINDS = ["expense", "income", "transfer"] as const

export const category = sqliteTable(
  "category",
  {
    id: text("id").primaryKey(),
    householdId: householdId(),
    name: text("name").notNull(),
    kind: text("kind", { enum: CATEGORY_KINDS }).notNull().default("expense"),
    icon: text("icon").notNull().default("i-lucide-circle-help"),
    color: text("color").notNull().default("neutral"),
    createdAt: createdAt(),
  },
  (table) => [index("category_household_idx").on(table.householdId)],
)

export const transaction = sqliteTable(
  "transaction",
  {
    id: text("id").primaryKey(),
    householdId: householdId(),
    accountId: text("account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    // The provider's id when it sends one; banks often don't, so `dedupeKey` decides what's new.
    externalId: text("external_id"),
    dedupeKey: text("dedupe_key").notNull(),
    date: text("date").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    description: text("description").notNull(),
    counterparty: text("counterparty"),
    categoryId: text("category_id").references(() => category.id, { onDelete: "set null" }),
    // Set when someone picks the category by hand, so rules never overwrite it.
    categoryLocked: integer("category_locked", { mode: "boolean" }).notNull().default(false),
    note: text("note"),
    status: text("status", { enum: ["booked", "pending"] })
      .notNull()
      .default("booked"),
    // Hidden from spending and forecasts (a refund pair, a duplicate the bank sent).
    excluded: integer("excluded", { mode: "boolean" }).notNull().default(false),
    // Only the account's owner sees it (a gift, a personal purchase), even on a shared account. server/utils/access.ts
    // `visibleTransactions` applies it; the balance, which the bank reports, still includes it.
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    // Shared by the two rows of one move between the household's accounts (server/utils/transfers.ts).
    transferId: text("transfer_id"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("transaction_account_dedupe_idx").on(table.accountId, table.dedupeKey),
    index("transaction_household_date_idx").on(table.householdId, table.date),
    index("transaction_account_date_idx").on(table.accountId, table.date),
    index("transaction_transfer_idx").on(table.transferId),
  ],
)

/** "Description contains X → category Y", applied to new transactions on every sync. */
export const rule = sqliteTable(
  "rule",
  {
    id: text("id").primaryKey(),
    householdId: householdId(),
    match: text("match").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [index("rule_household_idx").on(table.householdId)],
)

/** A monthly limit for a category. `ownerId` set: a personal budget over the owner's accounts; null: the household's. */
export const budget = sqliteTable(
  "budget",
  {
    id: text("id").primaryKey(),
    householdId: householdId(),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    amountMinor: integer("amount_minor").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("budget_scope_category_idx").on(table.householdId, table.ownerId, table.categoryId)],
)

/** Something to save for. Linked to an account, its progress is that balance; otherwise `savedMinor`. */
export const goal = sqliteTable(
  "goal",
  {
    id: text("id").primaryKey(),
    householdId: householdId(),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon").notNull().default("i-lucide-target"),
    targetMinor: integer("target_minor").notNull(),
    savedMinor: integer("saved_minor").notNull().default(0),
    targetDate: text("target_date"),
    accountId: text("account_id").references(() => financialAccount.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("goal_household_idx").on(table.householdId)],
)

/**
 * A payment that repeats: a subscription, rent, a salary. Detected from transactions (server/utils/recurring.ts)
 * and kept so people can confirm or dismiss one. `key` identifies the series across detections.
 */
export const recurring = sqliteTable(
  "recurring",
  {
    id: text("id").primaryKey(),
    householdId: householdId(),
    accountId: text("account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    // The previous charge's amount when the latest differs: a price change.
    previousAmountMinor: integer("previous_amount_minor"),
    currency: text("currency").notNull(),
    cadence: text("cadence", { enum: ["weekly", "monthly", "quarterly", "yearly"] }).notNull(),
    lastDate: text("last_date").notNull(),
    nextDate: text("next_date").notNull(),
    occurrences: integer("occurrences").notNull(),
    categoryId: text("category_id").references(() => category.id, { onDelete: "set null" }),
    status: text("status", { enum: ["detected", "confirmed", "dismissed"] })
      .notNull()
      .default("detected"),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("recurring_account_key_idx").on(table.accountId, table.key)],
)

/** One sync of one connection: when, what it found, and why it failed. */
export const syncRun = sqliteTable(
  "sync_run",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connection.id, { onDelete: "cascade" }),
    trigger: text("trigger", { enum: ["schedule", "manual", "link"] }).notNull(),
    status: text("status", { enum: ["running", "succeeded", "failed"] })
      .notNull()
      .default("running"),
    added: integer("added").notNull().default(0),
    error: text("error"),
    startedAt: createdAt(),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("sync_run_connection_idx").on(table.connectionId, table.startedAt)],
)
