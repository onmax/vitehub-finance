import { HTTPError } from "../utils/http-error"

import { useRuntimeConfig } from "nitro/runtime-config"
import { isDemoEmail } from "../../shared/demo"

/**
 * A public instance (`FINANCE_DEMO=1`, scripts/deployment.ts): anyone can sign up and use it with their own data, and the
 * login page also lets visitors into a fictional household (server/demo/seed.ts), reset every night.
 */
export const isDemo = () => Boolean(useRuntimeConfig().public.demo)

/** Lucía or Pablo, on a public instance. Only they are locked; everyone else gets the whole product. */
export const isDemoPerson = (email: string | null | undefined) => isDemo() && isDemoEmail(email)

export const DEMO_LOCKED = "Not available in the demo."

/**
 * Account, bank, and household management answer 403 for the demo's people, whoever drives them (the browser, an agent,
 * an API key); data edits stay open. Call it after `requireMember`.
 */
export function refuseDemoPerson(who: { email: string }) {
  if (isDemoPerson(who.email)) throw new HTTPError({ status: 403, statusText: DEMO_LOCKED, message: DEMO_LOCKED })
}

/**
 * The emails server/demo/seed.ts is signing up right now. Better Auth creates no other user under the demo's domain
 * (server/auth.ts `user.create.before`), whichever path asks.
 */
export const seedingEmails = new Set<string>()

/**
 * Better Auth endpoints the demo's people can't use: anything that changes who can sign in or who's in the household,
 * and the session list (it would show other visitors' sessions of the same demo person). server/auth.ts refuses them
 * when the session is a demo person's, or when the request names a demo email (a magic link, a password reset, an
 * invitation to one).
 */
export const DEMO_LOCKED_PATHS = new Set([
  "/sign-up/email",
  "/sign-in/magic-link",
  "/update-user",
  "/change-email",
  "/change-password",
  "/request-password-reset",
  "/reset-password",
  "/delete-user",
  "/delete-user/callback",
  "/passkey/generate-register-options",
  "/passkey/verify-registration",
  "/passkey/delete-passkey",
  "/passkey/update-passkey",
  "/two-factor/enable",
  "/two-factor/disable",
  "/two-factor/generate-backup-codes",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/organization/create",
  "/organization/update",
  "/organization/delete",
  "/organization/invite-member",
  "/organization/cancel-invitation",
  "/organization/accept-invitation",
  "/organization/reject-invitation",
  "/organization/remove-member",
  "/organization/update-member-role",
  "/organization/leave",
])
