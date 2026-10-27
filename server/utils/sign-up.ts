import { and, eq, gt } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import { invitation, user as users } from "../databases/config"
import { isAllowedEmail } from "./allowed"

export const SIGN_UP_NEEDS_INVITATION =
  "This server can't send email to confirm your address, so a new account needs an invitation. Ask your household's owner for an invite link and create your account from it."
export const SIGN_UP_WRONG_INVITATION =
  "This invitation is for another email, or it expired. Sign up with the email it went to, or ask for a new invitation."

/** A pending, unexpired invitation for this email: `id` names one, or any will do. */
export async function pendingInvitation(email: string, id?: string) {
  const [row] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.email, email.trim().toLowerCase()),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
        ...(id === undefined ? [] : [eq(invitation.id, id)]),
      ),
    )
    .limit(1)
  return row ?? null
}

/**
 * Why a password sign-up is refused on a build without Email, or null to let it through. Nothing proves the address
 * is the signer's, so whoever typed it first would own it, and the household invitation waiting for it. It goes
 * through for the instance's first person, when `FINANCE_ALLOWED_EMAILS` allows them (whoever sets the server up),
 * and for someone with the invitation link for that exact email: its id (`invitationId` in the body) went only to them.
 * Existing people sign in as before; a passkey or a password needs no new sign-up.
 */
export async function signUpRefusal(body: unknown, allowedEmails: string) {
  const { email, invitationId } = (body ?? {}) as { email?: unknown; invitationId?: unknown }
  if (typeof email !== "string") return null
  if (typeof invitationId === "string" && invitationId)
    return (await pendingInvitation(email, invitationId))
      ? null
      : { code: "SIGN_UP_WRONG_INVITATION", message: SIGN_UP_WRONG_INVITATION }
  const [anyone] = await db.select({ id: users.id }).from(users).limit(1)
  if (!anyone && isAllowedEmail(email, allowedEmails)) return null
  return { code: "SIGN_UP_NEEDS_INVITATION", message: SIGN_UP_NEEDS_INVITATION }
}
