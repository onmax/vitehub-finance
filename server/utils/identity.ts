import type { Auth } from "better-auth"
import { verifyJwsAccessToken } from "better-auth/oauth2"
import { and, asc, eq } from "drizzle-orm"
import { type H3Event, HTTPError } from "h3"
import { getAuthForRequest } from "vite-hub/auth/server"
import { db } from "vite-hub/database/drizzle"
import { member, oauthClient, user as users } from "../databases/config"
import type auth from "../auth"

type JoxiAuth = Auth<ReturnType<typeof auth.options>>

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

export const authFor = (event: H3Event) => getAuthForRequest(event.req, undefined, event) as unknown as JoxiAuth

export const bearerFrom = (headers: Headers) => headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null

/** Resolved once per request. Null when nobody is signed in or they belong to no household. */
export function identify(event: H3Event): Promise<Member | null> {
  return ((event.context as { joxiMember?: Promise<Member | null> }).joxiMember ??= resolve(event))
}

export async function requireMember(event: H3Event): Promise<Member> {
  const who = await identify(event)
  if (who) return who
  event.res.headers.set("WWW-Authenticate", 'Bearer realm="joxi"')
  throw new HTTPError({ status: 401, statusText: "Sign in, or connect through Joxi's MCP server." })
}

/** Household owners manage people and household settings. Agents never do, whoever connected them. */
export async function requireOwner(event: H3Event): Promise<Member> {
  const who = await requireMember(event)
  if (who.role !== "owner" || who.via !== "browser")
    throw new HTTPError({ status: 403, statusText: "Only the household's owner can do that, in the browser." })
  return who
}

async function resolve(event: H3Event): Promise<Member | null> {
  const token = bearerFrom(event.req.headers)
  if (token) return token.startsWith("joxi_") ? fromApiKey(event, token) : fromAccessToken(event, token)
  const session = await authFor(event)
    .api.getSession({ headers: event.req.headers })
    .catch(() => null)
  if (!session?.user) return null
  const active = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null
  return withHousehold({ userId: session.user.id, via: "browser" }, active)
}

// Signing keys read in-process (a Worker fetching its own hostname loops). Better Auth caches them per isolate.
const signingKeys = {}

/** An MCP client's OAuth access token: a JWT this Joxi issued for its own `/mcp`. */
async function fromAccessToken(event: H3Event, token: string) {
  const origin = event.url.origin
  const payload = await verifyJwsAccessToken(token, {
    jwksFetch: () => authFor(event).api.getJwks(),
    jwksCacheKey: signingKeys,
    verifyOptions: { issuer: `${origin}/api/auth`, audience: `${origin}/mcp` },
  }).catch(() => null)
  if (!payload?.sub) return null
  const clientId = typeof payload.client_id === "string" ? payload.client_id : null
  const [client] = clientId
    ? await db.select({ name: oauthClient.name }).from(oauthClient).where(eq(oauthClient.clientId, clientId)).limit(1)
    : []
  return withHousehold({ userId: payload.sub, via: "agent", clientName: client?.name || "MCP client" }, null)
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
