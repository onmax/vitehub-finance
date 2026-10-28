import { beforeAll, describe, expect, it, vi } from "vitest"
vi.mock("vite-hub/database/drizzle", async () => ({ db: (await import("../database")).db }))
vi.mock("vite-hub/kv", async () => ({ kv: (await import("../database")).kv }))
vi.mock("../../server/utils/staking", () => ({ stakingView: async () => null }))
vi.mock("../../server/utils/fx", () => ({ converterTo: async () => (minor: number) => minor }))
import { db, migrate, household, addAccount } from "../database"
import { financialAccount, goal } from "../../server/databases/config"
import { createGoal, listGoals, updateGoal } from "../../server/utils/goals"
import { eq } from "drizzle-orm"

beforeAll(migrate)
describe("backed goal allocations", () => {
  it("atomically rejects concurrent allocations that exceed current cash", async () => {
    const [who] = await household("goal-race", ["race-person"])
    const account = await addAccount({ householdId: who!.householdId, ownerId: who!.userId, balanceMinor: 10000, visibility: "household" })
    const results = await Promise.allSettled(["Holiday", "Emergency"].map(name => createGoal(who!, { name, targetMinor: 10000, savedMinor: 6000, accountId: account.id })))
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
    expect((await listGoals(who!)).reduce((sum, item) => sum + item.progressMinor, 0)).toBe(6000)
  })
  it("shares a balance shortfall proportionally without losing requested allocations", async () => {
    const [who] = await household("goal-drop", ["drop-person"])
    const account = await addAccount({ householdId: who!.householdId, ownerId: who!.userId, balanceMinor: 12000, visibility: "household" })
    await createGoal(who!, { name: "One", targetMinor: 9000, savedMinor: 6000, accountId: account.id })
    await createGoal(who!, { name: "Two", targetMinor: 9000, savedMinor: 6000, accountId: account.id })
    await db.update(financialAccount).set({ balanceMinor: 10000 }).where(eq(financialAccount.id, account.id))
    const rows = await listGoals(who!)
    expect(rows.map(row => [row.savedMinor, row.progressMinor, row.shortfallMinor])).toEqual([[6000, 5000, 1000], [6000, 5000, 1000]])
  })
  it("never mirrors a legacy account balance or reveals private backing to a partner", async () => {
    const [owner, partner] = await household("goal-private", ["private-person", "partner-person"])
    const account = await addAccount({ householdId: owner!.householdId, ownerId: owner!.userId, balanceMinor: 90000, visibility: "private" })
    await db.insert(goal).values({ id: "legacy-goal", householdId: owner!.householdId, name: "Legacy", targetMinor: 10000, savedMinor: 1234, accountId: account.id })
    expect((await listGoals(owner!))[0]).toMatchObject({ savedMinor: 1234, progressMinor: 0, allocationNeedsReview: true })
    expect((await listGoals(partner!))[0]).toMatchObject({ savedMinor: 0, progressMinor: 0, accountId: null, fundingUnavailable: true })
  })
  it("releases completed allocations and checks funding again on reactivation", async () => {
    const [who] = await household("goal-complete", ["complete-person"])
    const account = await addAccount({ householdId: who!.householdId, ownerId: who!.userId, balanceMinor: 10000, visibility: "household" })
    const first = await createGoal(who!, { name: "First", targetMinor: 10000, savedMinor: 10000, accountId: account.id })
    await updateGoal(who!, first.id, { completed: true })
    await createGoal(who!, { name: "Next", targetMinor: 10000, savedMinor: 10000, accountId: account.id })
    await expect(updateGoal(who!, first.id, { completed: false })).rejects.toMatchObject({ status: 409 })
  })
  it("keeps personal allocations on private cash and shared allocations on shared cash", async () => {
    const [who] = await household("goal-audience", ["audience-person"])
    const account = await addAccount({ householdId: who!.householdId, ownerId: who!.userId, balanceMinor: 10000, visibility: "household" })
    await expect(createGoal(who!, { name: "Private", targetMinor: 1000, savedMinor: 1000, accountId: account.id, personal: true })).rejects.toMatchObject({ status: 400 })
  })
})
