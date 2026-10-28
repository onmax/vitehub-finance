import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { ForecastScenario } from '../../shared/forecast'
import { organization, user } from './auth'

export const forecastPlan = sqliteTable('forecast_plan', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  visibility: text('visibility', { enum: ['private', 'household'] }).notNull().default('private'),
  scenario: text('scenario', { mode: 'json' }).$type<ForecastScenario>().notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
}, table => [index('forecast_plan_household').on(table.householdId)])
