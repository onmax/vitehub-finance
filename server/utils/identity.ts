import { HTTPError } from "./http-error"
import type { Auth } from "better-auth"
import { verifyJwsAccessToken } from "better-auth/oauth2"
import { and, asc, desc, eq } from "drizzle-orm"
import { useLogger } from "evlog/nitro/v3"
import { type H3Event } from "h3"
import { getAuthForRequest } from "vite-hub/auth/server"
import { db } from "vite-hub/database/drizzle"
import { member, oauthClient, oauthConsent, user as users } from "../databases/config"
import type auth from "../auth"
import { bearerFrom, isBrowserOnlyRoute, requireBrowser } from "./request-policy"

type FinanceAuth = Auth<ReturnType<typeof auth.options>>

/** Who is calling, in which household, and how: in the browser, through an MCP client, or with an API key. */
export interface Member {
  userId: string
  name: string
  email: string
  householdId: string
  role: "owner" | "member"
  via: "browser" | "agent" | "api-key"
  /** The MCP client's or API key's name, for agents and scripts. */
  clientName?: string
}

export const authFor = (event: H3Event) => getAuthForRequest(event.req, undefined, event) as unknown as FinanceAuth

/**
 * Resolved once per request. Null when nobody is signed in or they belong to no household. The request's wide event
 * gets who it was (ids, role, and how they came in), never a name, email, or credential.
 *
 * On a browser-only route (`isBrowserOnlyRoute`) an agent or API key gets a 403 here, so every handler that asks who
 * is calling enforces it. Here rather than in a middleware: ViteHub opens each request's database scope in a
 * middleware of its own, which runs after the app's.
 */
export function identify(event: H3Event): Promise<Member | null> {
  return ((event.context as { financeMember?: Promise<Member | null> }).financeMember ??= resolve(event).then((who) => {
    if (!who) return null
    useLogger(event).set({
      userId: who.userId,
      householdId: who.householdId,
      user: { role: who.role, via: who.via, ...(who.clientName ? { client: who.clientName } : {}) },
    })
    if (isBrowserOnlyRoute(event.req.method, event.url.pathname)) requireBrowser(who)
    return who
  }))
}

export async function requireMember(event: H3Event): Promise<Member> {
  const who = await identify(event)
  if (who) return who
  event.res.headers.set("WWW-Authenticate", 'Bearer realm="vitehub-finance"')
  throw new HTTPError({ status: 401, statusText: "Sign in, or send a valid access token or API key." })
}

/**
 * Household owners manage people and household settings. Agents never do, whoever connected them; see `requireBrowser`
 * (server/utils/request-policy.ts) for everything else they don't do.
 */
export async function requireOwner(event: H3Event): Promise<Member> {
  const who = await requireMember(event)
  if (who.role !== "owner" || who.via !== "browser")
    throw new HTTPError({ status: 403, statusText: "Only a household owner can do this, from the browser." })
  return who
}

async function resolve(event: H3Event): Promise<Member | null> {
  const token = bearerFrom(event.req.headers)
  if (token) return token.startsWith("fin_") ? fromApiKey(event, token) : fromAccessToken(event, token)
  const session = await authFor(event)
    .api.getSession({ headers: event.req.headers })
    .catch(() => null)
  if (!session?.user) return null
  const active = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null
  return withHousehold({ userId: session.user.id, via: "browser" }, active)
}

// Signing keys read in-process (a Worker fetching its own hostname loops). Better Auth caches them per isolate.
const signingKeys = {}

/** An MCP client's OAuth access token: a JWT this ViteHub Finance issued for its own `/mcp`. */
async function fromAccessToken(event: H3Event, token: string) {
  const origin = event.url.origin
  const payload = await verifyJwsAccessToken(token, {
    jwksFetch: () => authFor(event).api.getJwks(),
    jwksCacheKey: signingKeys,
    verifyOptions: { issuer: `${origin}/api/auth`, audience: `${origin}/mcp` },
  }).catch(() => null)
  if (!payload?.sub) return null
  const clientId = typeof payload.client_id === "string" ? payload.client_id : null
  if (!clientId) return null
  // The token is signed for an hour; the person's approval is checked on every request, so disconnecting the agent
  // (server/api/agents/[id].delete.ts) or disabling its client stops it at once. A token older than the approval it
  // finds (both in whole seconds) was issued under one that was withdrawn before the agent was connected again.
  const [grant] = await db
    .select({ name: oauthClient.name, disabled: oauthClient.disabled, grantedAt: oauthConsent.createdAt })
    .from(oauthConsent)
    .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
    .where(and(eq(oauthConsent.clientId, clientId), eq(oauthConsent.userId, payload.sub)))
    .orderBy(desc(oauthConsent.createdAt))
    .limit(1)
  if (!grant || grant.disabled) return null
  if (grant.grantedAt && typeof payload.iat === "number" && payload.iat * 1000 < grant.grantedAt.getTime()) return null
  return withHousehold({ userId: payload.sub, via: "agent", clientName: grant.name || "MCP client" }, null)
}

async function fromApiKey(event: H3Event, key: string) {
  const result = await authFor(event)
    .api.verifyApiKey({ body: { key } })
    .catch(() => null)
  if (!result?.valid || !result.key) return null
  return withHousehold({ userId: result.key.referenceId, via: "api-key", clientName: result.key.name || "API key" }, null)
}

async function withHousehold(
  who: { userId: string; via: Member["via"]; clientName?: string },
  preferred: string | null,
): Promise<Member | null> {
  const [person] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, who.userId)).limit(1)
  if (!person) return null
  // The session's household when they still belong to it, else their first. Membership is checked on every request,
  // so someone removed from a household loses access at once, whatever their session says.
  const memberships = await db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, who.userId))
    .orderBy(asc(member.createdAt))
  const membership = memberships.find((row) => row.organizationId === preferred) ?? memberships[0]
  if (!membership) return null
  return {
    ...who,
    ...person,
    householdId: membership.organizationId,
    role: membership.role === "owner" ? "owner" : "member",
  }
}

export async function householdMembers(householdId: string) {
  return db
    .select({ userId: member.userId, role: member.role, name: users.name, email: users.email, image: users.image })
    .from(member)
    .innerJoin(users, eq(users.id, member.userId))
    .where(and(eq(member.organizationId, householdId)))
    .orderBy(asc(member.createdAt))
}
