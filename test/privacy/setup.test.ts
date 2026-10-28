import { beforeAll, expect, it, vi } from "vitest"
vi.mock("vite-hub/database/drizzle", async () => ({ db: (await import("../database")).db }))
import { addAccount, addTransaction, db, household, migrate } from "../database"
import { transactionReview } from "../../server/databases/config"
import { setupStatus, updateSetup } from "../../server/utils/setup"
beforeAll(migrate)
it("keeps setup preferences per person and counts only their visible review queue", async () => {
  const [owner, partner] = await household("setup", ["setup-owner", "setup-partner"])
  const shared = await addAccount({ householdId: "setup", ownerId: owner!.userId, visibility: "household" })
  const privateAccount = await addAccount({ householdId: "setup", ownerId: owner!.userId, visibility: "private" })
  const visible = await addTransaction(shared)
  await addTransaction(shared, { hidden: true })
  await addTransaction(shared, { excluded: true })
  await addTransaction(privateAccount)
  await db.insert(transactionReview).values({ transactionId: visible.id, assignedTo: partner!.userId, revision: "setup-r1" })
  await updateSetup(owner!, { dismissed: true, sharingReviewed: true, checkin: true })
  expect(await setupStatus(partner!, "household")).toMatchObject({ dismissed: false, sharingReviewed: false, needsReview: 1, assignedToMe: 1 })
  expect((await setupStatus(partner!, "household")).checkins).toEqual(expect.arrayContaining([{ userId: owner!.userId, name: owner!.name, complete: true }]))
  expect(await setupStatus(owner!, "household")).toMatchObject({ dismissed: true, sharingReviewed: true, needsReview: 3 })
})
