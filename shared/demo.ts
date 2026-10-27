/**
 * The demo household's people (Lucía and Pablo, server/demo/scenario.ts) sign in with emails under this domain, and
 * nobody else can: sign-up refuses it (server/auth.ts). On the demo build (`FINANCE_DEMO=1`) they're the only people,
 * and the demo locks apply to them.
 */
export const DEMO_DOMAIN = "demo.vitehub.dev"

export const isDemoEmail = (email: string | null | undefined) =>
  typeof email === "string" && email.trim().toLowerCase().endsWith(`@${DEMO_DOMAIN}`)
