import { HTTPError } from "../utils/http-error"

import { useRuntimeConfig } from "nitro/runtime-config"
import { isDemoEmail } from "../../shared/demo"

/**
 * The demo build (`FINANCE_DEMO=1`, scripts/deployment.ts): visitors enter a made-up household (server/demo/seed.ts),
 * reset every night, without an account. Nobody signs up, so it never holds anyone's real data.
 */
export const isDemo = () => Boolean(useRuntimeConfig().public.demo)

/** Lucía or Pablo, on the demo build: the only people there, and read-only. */
export const isDemoPerson = (email: string | null | undefined) => isDemo() && isDemoEmail(email)

export const DEMO_LOCKED = "Not available in the demo."

/**
 * A 403 for the demo's people, whoever drives them (the browser, an agent, an API key). server/middleware/demo-read-only.ts
 * calls it for every write under `/api/`; MCP tools that write, and routes that manage banks, connections, people, or
 * the household, call it too, after `requireMember`. The top-level `code` is Better Auth's error shape, so its client
 * reads it like its own (app/utils/errors.ts maps `DEMO_LOCKED`).
 */
export function refuseDemoPerson(who: { email: string }) {
  if (isDemoPerson(who.email)) throw new HTTPError({ status: 403, statusText: DEMO_LOCKED, message: DEMO_LOCKED, body: { code: "DEMO_LOCKED" } })
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
