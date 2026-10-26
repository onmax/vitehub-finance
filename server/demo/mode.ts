import { HTTPError } from "h3"
import { useRuntimeConfig } from "nitro/runtime-config"

/** The public demo build (`FINANCE_DEMO=1`, nuxt.config.ts): a fictional household anyone can enter, reset nightly. */
export const isDemo = () => Boolean(useRuntimeConfig().public.demo)

export const DEMO_LOCKED = "Not available in the demo."

/** Account, bank, and household management answer 403 in the demo; data edits stay open. */
export function refuseInDemo() {
  if (isDemo()) throw new HTTPError({ status: 403, statusText: DEMO_LOCKED, message: DEMO_LOCKED })
}

/**
 * The emails server/demo/seed.ts is signing up right now. In the demo, Better Auth creates no other user
 * (server/auth.ts `user.create.before`), whichever path asks.
 */
export const seedingEmails = new Set<string>()

/**
 * Better Auth endpoints the demo turns off: anything that changes who can sign in or who's in the household, and the
 * session list (it would show other visitors' sessions of the same demo person).
 */
export const DEMO_DISABLED_PATHS = [
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
]
