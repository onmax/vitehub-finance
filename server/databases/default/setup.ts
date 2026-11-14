import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { organization, user } from "./auth"

export const financeSetup = sqliteTable("finance_setup", {
  householdId: text("household_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  dismissed: integer("dismissed", { mode: "boolean" }).notNull().default(false),
  sharingReviewed: integer("sharing_reviewed", { mode: "boolean" }).notNull().default(false),
  recurringReviewed: integer("recurring_reviewed", { mode: "boolean" }).notNull().default(false),
  forecastReviewed: integer("forecast_reviewed", { mode: "boolean" }).notNull().default(false),
  checkinMonth: text("checkin_month"),
}, table => [primaryKey({ columns: [table.householdId, table.userId] })])
