import { and, eq, gt, inArray, isNotNull, lt, lte } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import { defineSchedule } from "vite-hub/schedule"
import { dispatchSync } from "#dispatch"
import { send } from "#mailer"
import { connection, householdSettings, user as users } from "../databases/config"
import { isDemo } from "../demo/mode"
import { seedDemo } from "../demo/seed"
import { errorMessage, knownOrigin } from "../utils/connections"
import { detectTransfers } from "../utils/transfers"

const DAY = 24 * 60 * 60 * 1000

/**
 * Every morning: expire consents that ran out, remind owners a week before one does, drop bank links nobody finished,
 * then sync every active (or failed) connection one at a time. One failure never stops the rest.
 *
 * The demo has nothing to sync: it rebuilds its household as of today instead, wiping whatever visitors changed.
 */
export default defineSchedule({
  cron: "0 5 * * *",
  // Lets an operator run it now from the ViteHub Console or `vitehub schedule run daily`.
  manual: true,
  async handler({ scheduledAt }) {
    if (isDemo()) {
      await seedDemo(scheduledAt.toISOString().slice(0, 10))
      return { seeded: true }
    }
    const now = scheduledAt.getTime()
    const errors: unknown[] = []
    const step = async (run: () => Promise<unknown>) => run().catch((error) => errors.push(error))

    await step(() =>
      db
        .update(connection)
        .set({ status: "expired", lastError: "The bank consent has expired. Reconnect the bank to keep syncing." })
        .where(and(eq(connection.status, "active"), isNotNull(connection.consentExpiresAt), lte(connection.consentExpiresAt, new Date(now)))),
    )

    await step(async () => {
      const origin = await knownOrigin()
      const expiring = await db
        .select({ id: connection.id, name: connection.name, until: connection.consentExpiresAt, remindedAt: connection.remindedAt, email: users.email })
        .from(connection)
        .innerJoin(users, eq(users.id, connection.ownerId))
        .where(
          and(
            eq(connection.status, "active"),
            gt(connection.consentExpiresAt, new Date(now)),
            lte(connection.consentExpiresAt, new Date(now + 7 * DAY)),
          ),
        )
      for (const row of expiring) {
        if (row.remindedAt && now - row.remindedAt.getTime() < 6 * DAY) continue
        const until = row.until!.toISOString().slice(0, 10)
        await step(async () => {
          await send({
            to: row.email,
            subject: `Reconnect ${row.name} in ViteHub Finance`,
            text: [
              `Your consent for ${row.name} ends on ${until}. After that, ViteHub Finance can't fetch its balances and transactions.`,
              origin ? `Reconnect it here (it takes a minute at your bank): ${origin}/connect` : "Open ViteHub Finance and reconnect it on the Connect page.",
            ].join("\n\n"),
          })
          await db.update(connection).set({ remindedAt: new Date(now) }).where(eq(connection.id, row.id))
        })
      }
    })

    // Bank links abandoned at the consent screen, so they don't linger as "pending" forever.
    await step(() =>
      db.delete(connection).where(and(eq(connection.status, "pending"), lt(connection.createdAt, new Date(now - DAY)))),
    )

    // Pairs moves between accounts again, so rows imported or recategorized since yesterday can still pair.
    for (const { householdId } of await db.select({ householdId: householdSettings.householdId }).from(householdSettings))
      await step(() => detectTransfers(householdId))

    // Connections in `error` retry too: most errors (a bank or an API down) pass. Expired ones wait for their owner.
    const active = await db.select({ id: connection.id }).from(connection).where(inArray(connection.status, ["active", "error"]))
    for (const { id } of active) {
      await dispatchSync(id, "schedule").catch((error) => {
        console.error(`[finance] Scheduled sync of ${id} failed: ${errorMessage(error)}`)
        errors.push(error)
      })
    }

    if (errors.length) console.warn(`[finance] Daily run finished with ${errors.length} failure(s).`)
    return { synced: active.length, failures: errors.length }
  },
})
