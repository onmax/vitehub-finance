import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { budget } from "./finance"

/** Each change applies from its month forward, leaving previous months' limits intact. */
export const budgetVersion = sqliteTable("budget_version", {
  budgetId: text("budget_id").notNull().references(() => budget.id, { onDelete: "cascade" }),
  effectiveMonth: text("effective_month").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  carryEnabled: integer("carry_enabled", { mode: "boolean" }).notNull().default(false),
}, (table) => [primaryKey({ columns: [table.budgetId, table.effectiveMonth] })])
