// An in-memory SQLite database with the app's migrations, for tests that run server code against real queries. A test
// file mocks ViteHub's modules with it, before importing server code:
//
//   vi.mock("vite-hub/database/drizzle", async () => ({ db: (await import("../database")).db }))
//   vi.mock("vite-hub/kv", async () => ({ kv: (await import("../database")).kv }))
//
// Each test file gets its own module instance, so its own database. Only synthetic people and data go in here.
import { readdirSync, readFileSync } from "node:fs"
import { drizzle } from "drizzle-orm/libsql"
import {
  category,
  connection,
  financialAccount,
  householdSettings,
  member,
  organization,
  rule,
  transaction,
  user,
} from "../server/databases/config"
import type { Member } from "../server/utils/identity"

export const db = drizzle({ connection: { url: ":memory:" } })

const migrations = new URL("../server/databases/migrations/", import.meta.url)

/** Applies every migration in order. Call it once per file (`beforeAll`). */
export async function migrate() {
  for (const file of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort())
    await db.$client.executeMultiple(readFileSync(new URL(file, migrations), "utf8").replaceAll("--> statement-breakpoint", ""))
}

/** ViteHub's KV, in memory: `get` answers `[error, value]`. */
const store = new Map<string, unknown>()
export const kv = {
  get: async <T>(key: string): Promise<[null, T | undefined]> => [null, store.get(key) as T | undefined],
  set: async (key: string, value: unknown) => void store.set(key, value),
  del: async (key: string) => void store.delete(key),
}

/** A household with its people (the first is its owner), in `currency`; returns them as callers, in the browser. */
export async function household(id: string, people: string[], currency = "EUR") {
  await db.insert(organization).values({ id, name: id, slug: id })
  await db.insert(householdSettings).values({ householdId: id, currency })
  for (const [index, person] of people.entries()) {
    await db.insert(user).values({ id: person, name: person, email: `${person}@example.test` }).onConflictDoNothing()
    await db.insert(member).values({ id: `${id}:${person}`, organizationId: id, userId: person, role: index === 0 ? "owner" : "member" })
  }
  return people.map(
    (userId, index): Member => ({ userId, name: userId, email: `${userId}@example.test`, householdId: id, role: index === 0 ? "owner" : "member", via: "browser" }),
  )
}

let next = 0
const id = (prefix: string) => `${prefix}-${++next}`

export async function addAccount(values: Partial<typeof financialAccount.$inferInsert> & Pick<typeof financialAccount.$inferInsert, "householdId" | "ownerId">) {
  const [row] = await db
    .insert(financialAccount)
    .values({ id: id("account"), name: "Account", ...values })
    .returning()
  return row!
}

export async function addTransaction(
  account: Pick<typeof financialAccount.$inferSelect, "id" | "householdId" | "currency">,
  values: Partial<typeof transaction.$inferInsert> = {},
) {
  const key = id("tx")
  const [row] = await db
    .insert(transaction)
    .values({ id: key, householdId: account.householdId, accountId: account.id, dedupeKey: key, date: "2026-10-01", amountMinor: -1000, currency: account.currency, description: "Synthetic payment", ...values })
    .returning()
  return row!
}

export async function addCategory(householdId: string, name: string) {
  const [row] = await db.insert(category).values({ id: id("category"), householdId, name }).returning()
  return row!
}

export async function addRule(householdId: string, values: Pick<typeof rule.$inferInsert, "match"> & Partial<typeof rule.$inferInsert>) {
  const [row] = await db.insert(rule).values({ id: id("rule"), householdId, ...values }).returning()
  return row!
}

export async function addConnection(values: Partial<typeof connection.$inferInsert> & Pick<typeof connection.$inferInsert, "householdId" | "ownerId" | "provider">) {
  const [row] = await db
    .insert(connection)
    .values({ id: id("connection"), name: "Connection", status: "active", ...values })
    .returning()
  return row!
}
