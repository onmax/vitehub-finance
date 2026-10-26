import { and, desc, eq, sql } from "drizzle-orm"
import { defineHandler } from "h3"
import { db } from "vite-hub/database/drizzle"
import type { ConnectedAgent } from "#shared/api"
import { oauthClient, oauthConsent, oauthRefreshToken } from "../../databases/config"
import { requireMember } from "../../utils/identity"

/** The agents (MCP clients) the caller allowed, newest first. A refresh token is issued every time one reconnects. */
export default defineHandler(async (event): Promise<ConnectedAgent[]> => {
  const who = await requireMember(event)
  const lastSeen = db
    .select({ at: sql<number | null>`max(${oauthRefreshToken.createdAt})` })
    .from(oauthRefreshToken)
    .where(and(eq(oauthRefreshToken.clientId, oauthConsent.clientId), eq(oauthRefreshToken.userId, who.userId)))
  const rows = await db
    .select({
      id: oauthConsent.id,
      name: oauthClient.name,
      uri: oauthClient.uri,
      createdAt: oauthConsent.createdAt,
      lastSeen: sql<number | null>`(${lastSeen})`,
    })
    .from(oauthConsent)
    .leftJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
    .where(eq(oauthConsent.userId, who.userId))
    .orderBy(desc(oauthConsent.createdAt))
  return rows.map((row) => ({
    id: row.id,
    name: row.name || "MCP client",
    uri: row.uri,
    connectedAt: row.createdAt?.getTime() ?? null,
    lastSeenAt: row.lastSeen === null ? null : Number(row.lastSeen),
  }))
})
