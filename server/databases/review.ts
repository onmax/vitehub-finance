import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import type { TransactionSplit } from "../../shared/review"
import { user } from "./auth"
import { transaction } from "./finance"

export const transactionReview = sqliteTable("transaction_review", {
  transactionId: text("transaction_id").primaryKey().references(() => transaction.id, { onDelete: "cascade" }),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
  assignedTo: text("assigned_to").references(() => user.id, { onDelete: "set null" }),
  splits: text("splits", { mode: "json" }).$type<TransactionSplit[]>(),
  reimbursementOf: text("reimbursement_of").references(() => transaction.id, { onDelete: "set null" }),
  revision: text("revision").notNull(),
}, (table) => [index("transaction_review_assigned_idx").on(table.assignedTo)])
