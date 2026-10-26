import { and, desc, eq, isNotNull } from "drizzle-orm"
import { type H3Event, HTTPError } from "h3"
import * as v from "valibot"
import { db } from "vite-hub/database/drizzle"
import { kv } from "vite-hub/kv"
import { useServerEnv } from "#vitehub/env/server"
import type { Bank, ConnectionSummary, SyncRun } from "#shared/api"
import { connection, financialAccount, syncRun, user as users } from "../databases/config"
import { listBanks, startAuth, type Aspsp, type EnableBankingConfig } from "../providers/enable-banking"
import { ProviderError } from "../providers/types"
import type { Member } from "./identity"

export type ConnectionRow = typeof connection.$inferSelect

/** A failure message people can read: an HTTP error's text, a provider's explanation, or the error's own message. */
export function errorMessage(error: unknown) {
  if (error instanceof HTTPError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}

/** An HTTPError whose JSON body and status line both carry the readable reason. */
export const fail = (status: number, message: string) => new HTTPError({ status, statusText: message, message })

/** Parses a JSON body with a valibot schema; a 400 names the first problem. */
export async function readValid<S extends v.GenericSchema>(event: H3Event, schema: S): Promise<v.InferOutput<S>> {
  const body = await event.req.json().catch(() => {
    throw fail(400, "The request body must be JSON.")
  })
  const result = v.safeParse(schema, body)
  if (result.success) return result.output
  const issue = result.issues[0]
  const path = issue.path?.map((item) => item.key).join(".")
  throw fail(400, path ? `${path}: ${issue.message}` : issue.message)
}

/** Enable Banking's app id and key, or null when this ViteHub Finance has none. */
export function bankConfig(): EnableBankingConfig | null {
  const env = useServerEnv()
  const appId = env.enableBanking.appId?.trim()
  const privateKey = env.enableBanking.privateKey.unseal()?.trim()
  return appId && privateKey ? { appId, privateKey } : null
}

export function requireBankConfig() {
  const config = bankConfig()
  if (!config)
    throw fail(
      503,
      "Bank connections aren't set up on this ViteHub Finance. Set ENABLE_BANKING_APP_ID and ENABLE_BANKING_PRIVATE_KEY (enablebanking.com) and restart.",
    )
  return config
}

/** Turns provider failures into HTTP answers: a rejected key is 401, a bank limit 429, the rest 502. */
export function providerHttpError(error: unknown) {
  if (error instanceof HTTPError) return error
  if (error instanceof ProviderError) {
    const status = error.code === "auth" ? 401 : error.code === "rate_limited" ? 429 : error.code === "expired" ? 409 : 502
    return fail(status, error.message)
  }
  return fail(502, errorMessage(error))
}

/** The schedule has no request to read its origin from, so remember the one people use when they connect something. */
export async function rememberOrigin(event: H3Event) {
  const origin = event.url.origin
  const [, known] = await kv.get<string>("app:origin")
  if (known !== origin) await kv.set("app:origin", origin)
}

export async function knownOrigin() {
  const [, origin] = await kv.get<string>("app:origin")
  return origin ?? null
}

const BANKS_TTL = 24 * 60 * 60 * 1000

/** A country's banks, cached for a day: the list barely changes and every call costs a signed request. */
export async function banksIn(config: EnableBankingConfig, country: string): Promise<Aspsp[]> {
  const key = `eb-banks:${country}`
  const [, cached] = await kv.get<{ at: number; banks: Aspsp[] }>(key)
  if (cached && Date.now() - cached.at < BANKS_TTL) return cached.banks
  const banks = await listBanks(config, country)
  await kv.set(key, { at: Date.now(), banks })
  return banks
}

export function toBank(aspsp: Aspsp): Bank {
  return {
    name: aspsp.name,
    country: aspsp.country,
    logo: aspsp.logo ?? null,
    maxConsentDays: aspsp.maximum_consent_validity ? Math.floor(aspsp.maximum_consent_validity / 86400) : null,
  }
}

export async function findBank(config: EnableBankingConfig, name: string, country: string) {
  const banks = await banksIn(config, country)
  return banks.find((bank) => bank.name === name) ?? banks.find((bank) => bank.name.toLowerCase() === name.toLowerCase()) ?? null
}

export interface LinkState {
  connectionId: string
  userId: string
  at: number
}

export const STATE_TTL = 30 * 60 * 1000

/**
 * Sends someone to their bank for a consent on this connection. The random `state` in KV ties the bank's redirect back
 * to this connection and person for 30 minutes.
 */
export async function startBankLink(event: H3Event, who: Member, row: ConnectionRow, bank: Aspsp) {
  const config = requireBankConfig()
  const state = crypto.randomUUID().replace(/-/g, "")
  await kv.set(`eb-state:${state}`, { connectionId: row.id, userId: who.userId, at: Date.now() } satisfies LinkState)
  await rememberOrigin(event)
  return startAuth(config, {
    name: bank.name,
    country: bank.country,
    state,
    redirectUrl: `${event.url.origin}/api/connect/callback`,
    maxConsentSeconds: bank.maximum_consent_validity,
  })
}

/** A connection in the caller's household that the caller owns; others get 403, strangers 404. */
export async function requireOwnConnection(who: Member, id: string | undefined) {
  const [row] = id
    ? await db
        .select()
        .from(connection)
        .where(and(eq(connection.id, id), eq(connection.householdId, who.householdId)))
        .limit(1)
    : []
  if (!row) throw fail(404, "No such connection.")
  if (row.ownerId !== who.userId) throw fail(403, "Only the person who connected it can do that.")
  return row
}

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null)

/**
 * The caller's own connections plus other members' that feed at least one shared account. Counts only the accounts the
 * caller may see; credentials never leave the server.
 */
export async function listConnections(who: Member, onlyId?: string): Promise<ConnectionSummary[]> {
  const rows = await db
    .select({ connection, ownerName: users.name })
    .from(connection)
    .innerJoin(users, eq(users.id, connection.ownerId))
    .where(and(eq(connection.householdId, who.householdId), onlyId ? eq(connection.id, onlyId) : undefined))
    .orderBy(desc(connection.createdAt))
  const accounts = await db
    .select({ connectionId: financialAccount.connectionId, ownerId: financialAccount.ownerId, visibility: financialAccount.visibility })
    .from(financialAccount)
    .where(and(eq(financialAccount.householdId, who.householdId), isNotNull(financialAccount.connectionId)))
  const visible = new Map<string, number>()
  const shared = new Set<string>()
  for (const account of accounts) {
    if (!account.connectionId) continue
    if (account.visibility === "household") shared.add(account.connectionId)
    if (account.ownerId === who.userId || account.visibility === "household")
      visible.set(account.connectionId, (visible.get(account.connectionId) ?? 0) + 1)
  }
  return rows
    .filter(({ connection: row }) => row.ownerId === who.userId || shared.has(row.id))
    .map(({ connection: row, ownerName }) => ({
      id: row.id,
      provider: row.provider,
      name: row.name,
      institution: row.institution,
      status: row.status,
      ownerId: row.ownerId,
      ownerName,
      consentExpiresAt: iso(row.consentExpiresAt),
      lastSyncedAt: iso(row.lastSyncedAt),
      lastError: row.lastError,
      accountCount: visible.get(row.id) ?? 0,
      canManage: row.ownerId === who.userId,
    }))
}

export async function connectionSummary(who: Member, id: string) {
  const [summary] = await listConnections(who, id)
  if (!summary) throw fail(404, "No such connection.")
  return summary
}

export async function recentRuns(connectionId: string, limit = 20): Promise<SyncRun[]> {
  const rows = await db.select().from(syncRun).where(eq(syncRun.connectionId, connectionId)).orderBy(desc(syncRun.startedAt)).limit(limit)
  return rows.map((row) => ({
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    added: row.added,
    error: row.error,
    startedAt: row.startedAt.toISOString(),
    finishedAt: iso(row.finishedAt),
  }))
}

/** The same owner linking the same wallet or exchange key twice would double their net worth. */
export async function assertNotLinked(who: Member, provider: ConnectionRow["provider"], externalId: string) {
  const [existing] = await db
    .select({ id: connection.id })
    .from(connection)
    .where(
      and(
        eq(connection.householdId, who.householdId),
        eq(connection.ownerId, who.userId),
        eq(connection.provider, provider),
        eq(connection.externalId, externalId),
      ),
    )
    .limit(1)
  if (existing) throw fail(409, "You've already connected this. Sync or remove the existing connection instead.")
}
