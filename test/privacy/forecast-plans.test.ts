import { beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
vi.mock('vite-hub/database/drizzle', async () => ({ db: (await import('../database')).db }))
vi.mock('vite-hub/kv', async () => ({ kv: (await import('../database')).kv }))
import { addAccount, db, household, migrate } from '../database'
import { financialAccount, recurring } from '../../server/databases/config'
import { listForecastPlans, saveForecastPlan } from '../../server/utils/forecast-plans'
import { NO_SCENARIO } from '../../shared/forecast'

beforeAll(migrate)

describe('saved forecast plan privacy', () => {
  it('shares plans inside one household and enforces owner-only writes', async () => {
    const [owner, partner] = await household('plan-household', ['plan-owner', 'plan-partner'])
    const [outsider] = await household('plan-other', ['plan-outsider'])
    const account = await addAccount({ householdId: owner!.householdId, ownerId: owner!.userId, visibility: 'household' })
    const input = { name: 'Shared rent plan', visibility: 'household' as const, scenario: { ...NO_SCENARIO, accountId: account.id } }
    const plan = await saveForecastPlan(owner!, input)
    expect((await listForecastPlans(partner!)).map(item => item.id)).toContain(plan.id)
    expect(await listForecastPlans(outsider!)).toEqual([])
    await expect(saveForecastPlan(partner!, { ...input, name: 'Changed' }, plan.id)).rejects.toMatchObject({ status: 404 })
  })
  it('refuses private references in shared plans, and hides formerly shared plans after an account becomes private', async () => {
    const [owner, partner] = await household('private-plan-household', ['private-plan-owner', 'private-plan-partner'])
    const account = await addAccount({ householdId: owner!.householdId, ownerId: owner!.userId, visibility: 'private' })
    const input = { name: 'Sensitive future purchase', visibility: 'household' as const, scenario: { ...NO_SCENARIO, events: [{ id: 'secret-event', name: 'Private expense', kind: 'expense' as const, accountId: account.id, amountMinor: 1000, date: '2026-11-01', cadence: 'once' as const, endDate: null }] } }
    await expect(saveForecastPlan(owner!, input)).rejects.toMatchObject({ status: 400 })
    await db.update(financialAccount).set({ visibility: 'household' }).where(eq(financialAccount.id, account.id))
    const plan = await saveForecastPlan(owner!, input)
    expect((await listForecastPlans(partner!)).map(item => item.id)).toContain(plan.id)
    await db.update(financialAccount).set({ visibility: 'private' }).where(eq(financialAccount.id, account.id))
    expect(await listForecastPlans(partner!)).toEqual([])
    expect((await listForecastPlans(owner!)).map(item => item.id)).toContain(plan.id)
  })
  it('keeps private plans private even when their accounts are shared', async () => {
    const [owner, partner] = await household('private-plan', ['private-owner', 'private-partner'])
    const account = await addAccount({ householdId: owner!.householdId, ownerId: owner!.userId, visibility: 'household' })
    await saveForecastPlan(owner!, { name: 'Private draft', visibility: 'private', scenario: { ...NO_SCENARIO, accountId: account.id } })
    expect(await listForecastPlans(partner!)).toEqual([])
    expect((await listForecastPlans(owner!)).map(item => item.name)).toEqual(['Private draft'])
  })
  it('checks large skip lists within D1 binding limits and rejects an invalid reference in a later batch', async () => {
    const [owner] = await household('large-plan', ['large-plan-owner'])
    const account = await addAccount({ householdId: owner!.householdId, ownerId: owner!.userId, visibility: 'household' })
    const skip = Array.from({ length: 120 }, (_, index) => `large-series-${index}`)
    for (const id of skip) await db.insert(recurring).values({ id, householdId: owner!.householdId, accountId: account.id, key: id, name: id, amountMinor: -100, currency: 'EUR', cadence: 'monthly', lastDate: '2026-10-01', nextDate: '2026-11-01', occurrences: 3 })
    const execute = db.$client.execute.bind(db.$client)
    const bindings: number[] = []
    const guard = vi.spyOn(db.$client, 'execute').mockImplementation(statement => {
      const count = typeof statement === 'object' ? Object.keys(statement.args ?? {}).length : 0
      bindings.push(count)
      expect(count).toBeLessThanOrEqual(100)
      return execute(statement)
    })
    try {
      const input = { name: 'Large plan', visibility: 'household' as const, scenario: { ...NO_SCENARIO, skip: [...skip, skip[0]!] } }
      const saved = await saveForecastPlan(owner!, input)
      expect((await listForecastPlans(owner!)).map(plan => plan.id)).toContain(saved.id)
      await expect(saveForecastPlan(owner!, { ...input, scenario: { ...input.scenario, skip: [...skip, 'missing-series'] } })).rejects.toMatchObject({ status: 404 })
      expect(bindings).toContain(81)
    } finally { guard.mockRestore() }
  })

})
