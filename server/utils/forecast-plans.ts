import { and, eq, inArray, or } from 'drizzle-orm'
import { db } from 'vite-hub/database/drizzle'
import * as v from 'valibot'
import type { ForecastScenario } from '#shared/forecast'
import type { SavedForecastPlan } from '#shared/planning'
import { recurring } from '../databases/config'
import { forecastPlan } from '../databases/planning'
import { requireAccount, visibleAccountIds } from './access'
import { HTTPError } from './http-error'
import type { Member } from './identity'

export { PlanBody } from '#shared/planning-validation'
import { PlanBody } from '#shared/planning-validation'

async function referencedAccounts(who: Member, scenario: ForecastScenario) {
  const ids = new Set([scenario.accountId, scenario.oneOff?.accountId, ...(scenario.events ?? []).map(event => event.accountId)].filter((id): id is string => !!id))
  const skipped = [...new Set(scenario.skip)]
  for (let index = 0; index < skipped.length; index += 80) {
    const batch = skipped.slice(index, index + 80)
    const series = await db.select({ id: recurring.id, accountId: recurring.accountId }).from(recurring).where(and(eq(recurring.householdId, who.householdId), inArray(recurring.id, batch)))
    if (series.length !== batch.length) throw new HTTPError({ status: 404, statusText: 'No such recurring payment.' })
    for (const item of series) ids.add(item.accountId)
  }
  return [...ids]
}

const present = (row: typeof forecastPlan.$inferSelect): SavedForecastPlan => ({ id: row.id, name: row.name, ownerId: row.ownerId, visibility: row.visibility, scenario: row.scenario, updatedAt: row.updatedAt.toISOString() })

export async function listForecastPlans(who: Member) {
  const rows = await db.select().from(forecastPlan).where(and(eq(forecastPlan.householdId, who.householdId), or(eq(forecastPlan.ownerId, who.userId), eq(forecastPlan.visibility, 'household'))))
  const visible = new Set(await visibleAccountIds(who))
  const result: SavedForecastPlan[] = []
  for (const row of rows) {
    // Recheck every read: an account can become private after the plan was shared.
    try {
      const ids = await referencedAccounts(who, row.scenario)
      if (ids.every(id => visible.has(id))) result.push(present(row))
    } catch (error) {
      if (!(error instanceof HTTPError) || error.status !== 404) throw error
    }
  }
  return result
}

export async function saveForecastPlan(who: Member, input: v.InferOutput<typeof PlanBody>, id?: string) {
  const ids = await referencedAccounts(who, input.scenario)
  for (const accountId of ids) {
    const account = await requireAccount(who, accountId)
    if (input.visibility === 'household' && account.visibility !== 'household') throw new HTTPError({ status: 400, statusText: 'Shared plans require shared accounts.' })
  }
  if (id) {
    const [row] = await db.select().from(forecastPlan).where(and(eq(forecastPlan.id, id), eq(forecastPlan.householdId, who.householdId), eq(forecastPlan.ownerId, who.userId)))
    if (!row) throw new HTTPError({ status: 404, statusText: 'No such forecast plan.' })
    const [saved] = await db.update(forecastPlan).set({ ...input, updatedAt: new Date() }).where(eq(forecastPlan.id, id)).returning()
    return present(saved!)
  }
  const [saved] = await db.insert(forecastPlan).values({ ...input, id: crypto.randomUUID(), householdId: who.householdId, ownerId: who.userId }).returning()
  return present(saved!)
}

export async function deleteForecastPlan(who: Member, id: string) {
  await db.delete(forecastPlan).where(and(eq(forecastPlan.id, id), eq(forecastPlan.householdId, who.householdId), eq(forecastPlan.ownerId, who.userId)))
}
