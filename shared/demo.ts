/**
 * The demo household's people (Lucía and Pablo, server/demo/scenario.ts) sign in with emails under this domain, and
 * nobody else can: sign-up refuses it (server/auth.ts). On a public instance (`FINANCE_DEMO=1`) the demo locks apply to
 * these people only; everyone else who signs up uses the real product.
 */
export const DEMO_DOMAIN = "demo.vitehub.dev"

export const isDemoEmail = (email: string | null | undefined) =>
  typeof email === "string" && email.trim().toLowerCase().endsWith(`@${DEMO_DOMAIN}`)
