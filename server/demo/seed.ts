import { and, eq, inArray, like, or } from "drizzle-orm"
import type { Auth } from "better-auth"
import { getAuth } from "vite-hub/auth/server"
import { db } from "vite-hub/database/drizzle"
import { kv } from "vite-hub/kv"
import { useServerEnv } from "#vitehub/env/server"
import {
  account as authAccount,
  apikey,
  balanceSnapshot,
  budget,
  category,
  connection,
  financialAccount,
  goal,
  holding,
  householdSettings,
  invitation,
  member,
  oauthAccessToken,
  oauthConsent,
  oauthRefreshToken,
  organization,
  passkey,
  recurring,
  rule,
  session,
  syncRun,
  transaction,
  twoFactor,
  user as users,
} from "../databases/config"
import type auth from "../auth"
import { detectRecurring } from "../utils/recurring"
import { backfillSnapshots, recordSnapshot } from "../utils/snapshots"
import { todayIso } from "../utils/dates"
import { seedingEmails } from "./mode"
import { DEMO_HOUSEHOLD, DEMO_PEOPLE, demoScenario, type DemoPerson } from "./scenario"

type FinanceAuth = Auth<ReturnType<typeof auth.options>>

const DAY = 24 * 60 * 60 * 1000
const SEEDED = "demo:seeded"
const DEMO_DOMAIN = "@demo.vitehub.dev"
const id = () => crypto.randomUUID()

/** Runs `insert` over `rows` in chunks that stay under D1's 100 bound parameters a statement. */
async function inChunks<T>(rows: T[], size: number, insert: (chunk: T[]) => Promise<unknown>) {
  for (let index = 0; index < rows.length; index += size) await insert(rows.slice(index, index + size))
}

/**
 * The demo people's password: derived from the auth secret, so nobody outside the server knows it. Visitors enter
 * through `POST /api/demo/session`, which signs in with it server-side.
 */
export async function demoPassword(person: DemoPerson) {
  const secret = useServerEnv().auth.secret.unseal() || "vitehub-finance-demo"
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`demo-password:${DEMO_PEOPLE[person].email}`))
  return btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32)
}

let running: Promise<void> | null = null

/** Wipes the previous demo household and builds a fresh one as of `today`. Concurrent calls share one run. */
export function seedDemo(today = todayIso()) {
  return (running ??= build(today).finally(() => (running = null)))
}

/** Seeds when the demo isn't there yet (a fresh database, or last night's reset failed). */
export async function ensureDemo() {
  if (running) return running
  const [, seeded] = await kv.get<{ date: string }>(SEEDED)
  if (seeded) {
    const [lucia] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_PEOPLE.lucia.email)).limit(1)
    if (lucia) return
  }
  await seedDemo()
}

/** Every row the demo people and their households own. SQLite may run without foreign keys, so children go first. */
async function wipe() {
  const people = await db
    .select({ id: users.id })
    .from(users)
    .where(or(inArray(users.email, Object.values(DEMO_PEOPLE).map((person) => person.email)), like(users.email, `%${DEMO_DOMAIN}`)))
  const userIds = people.map((row) => row.id)
  if (!userIds.length) return
  // Households only demo people belong to; anyone else's household stays whatever happens.
  const memberships = await db.select({ organizationId: member.organizationId, userId: member.userId }).from(member)
  const demoUsers = new Set(userIds)
  const touched = new Set(memberships.filter((row) => demoUsers.has(row.userId)).map((row) => row.organizationId))
  const households = [...touched].filter((household) =>
    memberships.filter((row) => row.organizationId === household).every((row) => demoUsers.has(row.userId)),
  )

  if (households.length) {
    const accountIds = (
      await db.select({ id: financialAccount.id }).from(financialAccount).where(inArray(financialAccount.householdId, households))
    ).map((row) => row.id)
    const connectionIds = (
      await db.select({ id: connection.id }).from(connection).where(inArray(connection.householdId, households))
    ).map((row) => row.id)
    await db.delete(transaction).where(inArray(transaction.householdId, households))
    await db.delete(recurring).where(inArray(recurring.householdId, households))
    await inChunks(accountIds, 80, async (ids) => {
      await db.delete(holding).where(inArray(holding.accountId, ids))
      await db.delete(balanceSnapshot).where(inArray(balanceSnapshot.accountId, ids))
    })
    await db.delete(goal).where(inArray(goal.householdId, households))
    await db.delete(budget).where(inArray(budget.householdId, households))
    await db.delete(financialAccount).where(inArray(financialAccount.householdId, households))
    await inChunks(connectionIds, 80, (ids) => db.delete(syncRun).where(inArray(syncRun.connectionId, ids)))
    await db.delete(connection).where(inArray(connection.householdId, households))
    await db.delete(rule).where(inArray(rule.householdId, households))
    await db.delete(category).where(inArray(category.householdId, households))
    await db.delete(householdSettings).where(inArray(householdSettings.householdId, households))
    await db.delete(invitation).where(inArray(invitation.organizationId, households))
    await db.delete(member).where(inArray(member.organizationId, households))
    await db.delete(organization).where(inArray(organization.id, households))
  }
  // Whatever the visitors made as these people: API keys, passkeys, agents' tokens, sessions.
  await db.delete(member).where(inArray(member.userId, userIds))
  await db.delete(apikey).where(inArray(apikey.referenceId, userIds))
  await db.delete(oauthAccessToken).where(inArray(oauthAccessToken.userId, userIds))
  await db.delete(oauthRefreshToken).where(inArray(oauthRefreshToken.userId, userIds))
  await db.delete(oauthConsent).where(inArray(oauthConsent.userId, userIds))
  await db.delete(passkey).where(inArray(passkey.userId, userIds))
  await db.delete(twoFactor).where(inArray(twoFactor.userId, userIds))
  await db.delete(session).where(inArray(session.userId, userIds))
  await db.delete(authAccount).where(inArray(authAccount.userId, userIds))
  await db.delete(users).where(inArray(users.id, userIds))
}

/** Signs a demo person up through Better Auth (hashed password, the sign-up hooks), the one user the demo allows. */
async function signUp(person: DemoPerson) {
  const { name, email } = DEMO_PEOPLE[person]
  seedingEmails.add(email)
  try {
    await (getAuth() as unknown as FinanceAuth).api.signUpEmail({ body: { name, email, password: await demoPassword(person) } })
  } finally {
    seedingEmails.delete(email)
  }
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (!row) throw new Error(`[finance] The demo couldn't create ${email}.`)
  const [membership] = await db.select({ organizationId: member.organizationId }).from(member).where(eq(member.userId, row.id)).limit(1)
  if (!membership) throw new Error(`[finance] ${email} has no household.`)
  return { userId: row.id, householdId: membership.organizationId }
}

async function build(today: string) {
  const scenario = demoScenario(today)
  await wipe()

  // Both sign up (each gets a household with the default categories and rules), then Pablo moves into Lucía's.
  const lucia = await signUp("lucia")
  const pablo = await signUp("pablo")
  const householdId = lucia.householdId
  const owners: Record<DemoPerson, string> = { lucia: lucia.userId, pablo: pablo.userId }
  await db.update(organization).set({ name: DEMO_HOUSEHOLD }).where(eq(organization.id, householdId))
  await db.delete(rule).where(eq(rule.householdId, pablo.householdId))
  await db.delete(category).where(eq(category.householdId, pablo.householdId))
  await db.delete(householdSettings).where(eq(householdSettings.householdId, pablo.householdId))
  await db.delete(member).where(eq(member.organizationId, pablo.householdId))
  await db.delete(organization).where(eq(organization.id, pablo.householdId))
  await db.insert(member).values({ id: id(), organizationId: householdId, userId: pablo.userId, role: "member" })
  await db.update(users).set({ emailVerified: true }).where(inArray(users.id, [lucia.userId, pablo.userId]))
  // Sign-up opened sessions nobody holds.
  await db.delete(session).where(inArray(session.userId, [lucia.userId, pablo.userId]))
  await db
    .insert(householdSettings)
    .values({ householdId, currency: "EUR", shareNewAccounts: true })
    .onConflictDoUpdate({ target: householdSettings.householdId, set: { currency: "EUR", shareNewAccounts: true } })

  const categories = new Map(
    (await db.select({ id: category.id, name: category.name }).from(category).where(eq(category.householdId, householdId))).map((row) => [
      row.name,
      row.id,
    ]),
  )
  const categoryId = (name: string | null) => (name ? categories.get(name) : undefined)

  // This morning's sync, never in the future when the demo seeds itself before the 05:00 schedule.
  const synced = new Date(Math.min(Date.now() - 60_000, Date.parse(`${today}T05:03:00Z`)))
  const connectionIds = new Map(scenario.connections.map((entry) => [entry.key, id()]))
  await db.insert(connection).values(
    scenario.connections.map((entry) => ({
      id: connectionIds.get(entry.key)!,
      householdId,
      ownerId: owners[entry.owner],
      provider: entry.provider,
      name: entry.name,
      institution: entry.institution,
      country: entry.country ?? undefined,
      status: "active" as const,
      // Never real credentials: the demo has nothing to sync with.
      externalId: entry.externalId,
      consentExpiresAt: entry.consentDays === null ? undefined : new Date(Date.parse(`${today}T12:00:00Z`) + entry.consentDays * DAY),
      lastSyncedAt: synced,
    })),
  )
  // A week of quiet daily syncs for each connection's history.
  const runs = scenario.connections.flatMap((entry, index) =>
    Array.from({ length: 7 }, (_, day) => {
      const startedAt = new Date(synced.getTime() - day * DAY + index * 4000)
      return {
        id: id(),
        connectionId: connectionIds.get(entry.key)!,
        trigger: "schedule" as const,
        status: "succeeded" as const,
        added: entry.provider === "bitcoin" ? 0 : (day * 7 + index * 3) % 6,
        startedAt,
        finishedAt: new Date(startedAt.getTime() + 2400 + index * 700),
      }
    }),
  )
  await inChunks(runs, 12, (chunk) => db.insert(syncRun).values(chunk))

  const accountIds = new Map(scenario.accounts.map((entry) => [entry.key, id()]))
  const now = new Date()
  await inChunks(scenario.accounts, 5, (chunk) =>
    db.insert(financialAccount).values(
      chunk.map((entry) => ({
        id: accountIds.get(entry.key)!,
        householdId,
        ownerId: owners[entry.owner],
        connectionId: entry.connection ? connectionIds.get(entry.connection) : undefined,
        externalId: entry.externalId ?? undefined,
        name: entry.name,
        institution: entry.institution,
        kind: entry.kind,
        currency: "EUR",
        balanceMinor: entry.balanceMinor,
        iban: entry.iban ?? undefined,
        visibility: entry.visibility,
        householdPermission: entry.householdPermission,
        balanceUpdatedAt: entry.connection ? synced : now,
      })),
    ),
  )
  await db.insert(holding).values(
    scenario.holdings.map(({ account, ...entry }) => ({ id: id(), accountId: accountIds.get(account)!, ...entry })),
  )

  const rows = scenario.transactions.map((entry, index) => ({
    id: id(),
    householdId,
    accountId: accountIds.get(entry.account)!,
    dedupeKey: `demo:${entry.date}:${index}`,
    date: entry.date,
    amountMinor: entry.amountMinor,
    currency: "EUR",
    description: entry.description,
    counterparty: entry.counterparty ?? undefined,
    categoryId: categoryId(entry.category),
    categoryLocked: entry.locked ? true : undefined,
    note: entry.note,
  }))
  // Up to 16 values a row once defaults are counted: six rows a statement.
  await inChunks(rows, 6, (chunk) => db.insert(transaction).values(chunk))

  const snapshots = scenario.snapshots.map((entry) => ({ accountId: accountIds.get(entry.account)!, date: entry.date, balanceMinor: entry.balanceMinor }))
  await inChunks(snapshots, 30, (chunk) => db.insert(balanceSnapshot).values(chunk).onConflictDoNothing())

  await db.insert(budget).values(
    scenario.budgets.map((entry) => ({ id: id(), householdId, categoryId: categoryId(entry.category)!, amountMinor: entry.amountMinor })),
  )
  await inChunks(scenario.goals, 6, (chunk) =>
    db.insert(goal).values(
      chunk.map((entry) => ({
        id: id(),
        householdId,
        ownerId: entry.owner ? owners[entry.owner] : undefined,
        name: entry.name,
        icon: entry.icon,
        targetMinor: entry.targetMinor,
        savedMinor: entry.savedMinor,
        targetDate: entry.targetDate ?? undefined,
        accountId: entry.account ? accountIds.get(entry.account) : undefined,
      })),
    ),
  )

  // What a sync does after writing transactions: recurring series and the balance history behind the charts.
  const allAccounts = [...accountIds.values()]
  await detectRecurring(householdId, allAccounts)
  for (const entry of scenario.accounts) {
    const accountId = accountIds.get(entry.key)!
    await recordSnapshot(accountId, entry.balanceMinor, today)
    await backfillSnapshots(accountId)
  }
  // The couple confirmed the payments they know about and dismissed moves between their own accounts.
  await db
    .update(recurring)
    .set({ status: "confirmed" })
    .where(and(eq(recurring.householdId, householdId), inArray(recurring.key, scenario.confirmed)))
  const transfers = categories.get("Transfers")
  if (transfers)
    await db
      .update(recurring)
      .set({ status: "dismissed" })
      .where(and(eq(recurring.householdId, householdId), eq(recurring.categoryId, transfers)))

  await kv.set(SEEDED, { date: today, at: Date.now() })
  console.info(`[finance] Demo household seeded for ${today}: ${rows.length} transactions.`)
}
