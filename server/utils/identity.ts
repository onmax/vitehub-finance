import { HTTPError } from "./http-error"
import { and, asc, desc, eq } from "drizzle-orm"
import { useLogger } from "evlog/nitro/v3"
import { type H3Event } from "h3"
import { requireCaller, useAuth } from "vite-hub/auth/server"
import { db } from "vite-hub/database"
import { member, oauthConsent, user as users } from "../databases/default"
import { bearerFrom, isBrowserOnlyRoute, requireBrowser } from "./request-policy"

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

export const authFor = (event: H3Event) => useAuth(event)

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
  if (token?.startsWith("fin_")) return fromApiKey(event, token)
  // A session, or an MCP client's OAuth access token for this ViteHub Finance, checked with the signing keys read
  // in-process (a Worker fetching its own hostname loops).
  const result = await requireCaller(event).catch(() => null)
  if (!result) return null
  const [error, caller] = result
  if (error) return null
  if (caller.kind === "browser") {
    const active = (caller.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null
    return withHousehold({ userId: caller.user.id, via: "browser" }, active)
  }
  // The token is signed for an hour; the person's approval is checked on every request, so disconnecting the agent
  // (server/api/agents/[id].delete.ts) stops it at once. A token older than the approval it finds (both in whole
  // seconds) was issued under one that was withdrawn before the agent was connected again.
  const [grant] = await db
    .select({ grantedAt: oauthConsent.createdAt })
    .from(oauthConsent)
    .where(and(eq(oauthConsent.clientId, caller.client.id), eq(oauthConsent.userId, caller.user.id)))
    .orderBy(desc(oauthConsent.createdAt))
    .limit(1)
  if (!grant) return null
  const issuedAt = token ? issuedAtOf(token) : undefined
  if (grant.grantedAt && issuedAt !== undefined && issuedAt * 1000 < grant.grantedAt.getTime()) return null
  return withHousehold({ userId: caller.user.id, via: "agent", clientName: caller.client.name || "MCP client" }, null)
}

/** The `iat` claim of an access token that requireCaller already verified. */
function issuedAtOf(token: string): number | undefined {
  try {
    const payload: unknown = JSON.parse(atob((token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")))
    return typeof payload === "object" && payload !== null && "iat" in payload && typeof payload.iat === "number" ? payload.iat : undefined
  } catch {
    return undefined
  }
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
    .where(eq(member.organizationId, householdId))
    .orderBy(asc(member.createdAt))
}
