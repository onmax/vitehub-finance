import { and, eq } from "drizzle-orm"
import { defineHandler, HTTPError } from "h3"
import { db } from "vite-hub/database/drizzle"
import { oauthAccessToken, oauthConsent, oauthRefreshToken } from "../../databases/config"
import { requireMember } from "../../utils/identity"
import { param } from "../../utils/input"

/**
 * Disconnects an agent: its approval and refresh tokens go, so it has to ask again. An access token it already holds
 * is a signed JWT and works until it expires (an hour at most). Only people in the browser disconnect agents.
 */
export default defineHandler(async (event) => {
  const who = await requireMember(event)
  if (who.via !== "browser") throw new HTTPError({ status: 403, statusText: "Disconnect agents in the browser." })
  const [consent] = await db
    .select()
    .from(oauthConsent)
    .where(and(eq(oauthConsent.id, param(event)), eq(oauthConsent.userId, who.userId)))
    .limit(1)
  if (!consent) throw new HTTPError({ status: 404, statusText: "No connected agent with that id." })
  const mine = (table: typeof oauthRefreshToken | typeof oauthAccessToken) =>
    and(eq(table.clientId, consent.clientId), eq(table.userId, who.userId))
  await db.delete(oauthRefreshToken).where(mine(oauthRefreshToken))
  await db.delete(oauthAccessToken).where(mine(oauthAccessToken))
  await db.delete(oauthConsent).where(eq(oauthConsent.id, consent.id))
  return { ok: true }
})
