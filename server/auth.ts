import { apiKey } from "@better-auth/api-key"
import { oauthProvider } from "@better-auth/oauth-provider"
import { passkey } from "@better-auth/passkey"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { jwt, lastLoginMethod, magicLink, organization, twoFactor } from "better-auth/plugins"
import { and, eq, gt, isNull } from "drizzle-orm"
import { defineAuth } from "vite-hub/auth"
import { db, schema } from "vite-hub/database/drizzle"
import { send } from "#mailer"
import { invitation, member, session } from "./databases/config"
import { DEMO_DISABLED_PATHS, isDemo, seedingEmails } from "./demo/mode"
import { isAllowedEmail } from "./utils/allowed"
import { requestLanguage } from "./utils/language"
import { isLocale } from "../shared/locale"
import { createHousehold } from "./utils/household"

/**
 * Who can sign in, and how.
 *
 * Email and password, a passkey, or (when the build has Email) a magic link; two-factor is optional per person.
 * `FINANCE_ALLOWED_EMAILS` keeps a private ViteHub Finance private: only those emails, plus anyone a household invited, can sign up.
 *
 * A household is a Better Auth organization. Signing up makes your own, unless an invitation is waiting for your
 * email: then /invite/<id> adds you to that household instead. Each session points at the household you're in.
 *
 * The public demo (`FINANCE_DEMO=1`) creates no users but its own two (server/demo/seed.ts) and turns off the endpoints
 * that change who signs in or who's in the household (server/demo/mode.ts).
 *
 * MCP clients connect through OAuth 2.1 (`oauthProvider`, tokens signed by `jwt`, scoped to `<origin>/mcp`). Scripts
 * that can't do OAuth use a personal API key (`apiKey`) as a bearer token instead.
 */
export default defineAuth(({ env, requestOrigin }) => ({
  appName: "ViteHub Finance",
  baseURL: requestOrigin,
  secret: env.auth.secret.unseal(),
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  // Mounted by server/api/auth/[...all].ts: the Nuxt module doesn't add ViteHub's generated Auth route.
  route: false,
  user: { additionalFields: { language: { type: ["en", "es", "fr", "de", "pt"], required: false, input: true } } },
  emailAndPassword: { enabled: true, minPasswordLength: 10 },
  // `/token` is the JWT plugin's session-to-JWT endpoint, which nothing in ViteHub Finance needs.
  disabledPaths: ["/token", ...(isDemo() ? DEMO_DISABLED_PATHS : [])],
  databaseHooks: {
    user: {
      create: {
        before: async (person, context) => {
          if (isDemo()) return seedingEmails.has(person.email.toLowerCase()) ? undefined : false
          if (!isAllowedEmail(person.email, env.finance.allowedEmails.unseal()) && !(await pendingInvitation(person.email))) return false
          const language = "language" in person && isLocale(person.language) ? person.language : requestLanguage(context?.headers)
          return { data: { ...person, language } }
        },
        // Invited people join the inviter's household from the invitation page; everyone else gets their own.
        after: async (person) => {
          if (await pendingInvitation(person.email)) return
          const householdId = await createHousehold(person)
          // Sign-up may open the session before this hook runs; point it at the new household.
          await db
            .update(session)
            .set({ activeOrganizationId: householdId })
            .where(and(eq(session.userId, person.id), isNull(session.activeOrganizationId)))
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const [membership] = await db
            .select({ organizationId: member.organizationId })
            .from(member)
            .where(eq(member.userId, session.userId))
            .orderBy(member.createdAt)
            .limit(1)
          return { data: { ...session, activeOrganizationId: membership?.organizationId ?? null } }
        },
      },
    },
  },
  plugins: [
    organization({
      // Households come from sign-up (server/utils/household.ts); people don't make more of them by hand.
      allowUserToCreateOrganization: false,
      creatorRole: "owner",
      invitationExpiresIn: 7 * 24 * 60 * 60,
      cancelPendingInvitationsOnReInvite: true,
      sendInvitationEmail: async ({ id, email, inviter, organization: household }) => {
        await send({
          to: email,
          subject: `${inviter.user.name} invited you to ${household.name} on ViteHub Finance`,
          text: `${inviter.user.name} wants to share finances with you on ViteHub Finance.\n\nJoin here: ${requestOrigin}/invite/${id}\n\nThe link works for 7 days.`,
        })
      },
    }),
    passkey({
      rpID: new URL(requestOrigin).hostname,
      rpName: "ViteHub Finance",
      origin: requestOrigin,
    }),
    twoFactor({ issuer: "ViteHub Finance" }),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await send({ to: email, subject: "Sign in to ViteHub Finance", text: `Sign in to ViteHub Finance: ${url}\n\nThe link works for 5 minutes.` })
      },
    }),
    apiKey({
      defaultPrefix: "fin_",
      enableMetadata: true,
      rateLimit: { enabled: true, timeWindow: 60 * 1000, maxRequests: 120 },
    }),
    lastLoginMethod({ storeInDatabase: true }),
    jwt(),
    oauthProvider({
      loginPage: "/oauth",
      consentPage: "/oauth",
      codeExpiresIn: 30 * 60,
      scopes: ["openid", "profile", "email", "offline_access"],
      resources: [`${requestOrigin}/mcp`],
      enforcePerClientResources: false,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      // MCP clients register loopback or private-use redirects without `application_type`; register them as native.
      clientRegistrationDefaultApplicationType: "infer",
    }),
  ],
}))

async function pendingInvitation(email: string) {
  const [row] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.email, email.toLowerCase()),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1)
  return row ?? null
}
