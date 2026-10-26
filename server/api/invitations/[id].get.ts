import { and, eq, gt } from "drizzle-orm"
import { defineHandler, HTTPError } from "h3"
import { db } from "vite-hub/database/drizzle"
import { invitation, organization, user as users } from "../../databases/config"

/**
 * What a signed-out invitee sees before creating an account: the household, who invited them, and the email to use.
 * Public on purpose: the invitation id is an unguessable link only the invitee received, and only pending, unexpired
 * invitations answer. Nothing about the household's money is here.
 */
export default defineHandler(async (event) => {
  const id = event.context.params?.id
  const [row] = id
    ? await db
        .select({ email: invitation.email, householdName: organization.name, inviterName: users.name })
        .from(invitation)
        .innerJoin(organization, eq(organization.id, invitation.organizationId))
        .innerJoin(users, eq(users.id, invitation.inviterId))
        .where(and(eq(invitation.id, id), eq(invitation.status, "pending"), gt(invitation.expiresAt, new Date())))
        .limit(1)
    : []
  if (!row) throw new HTTPError({ status: 404, statusText: "This invitation has expired or was already used." })
  return row
})
