import { eq } from "drizzle-orm"
import * as v from "valibot"
import { cloudflare, type AiGateway, typesafe, vercel } from "vite-hub/gateways"
import { db } from "vite-hub/database/drizzle"
import { useServerEnv } from "#vitehub/env/server"
import type { AiGatewayInput, AiGatewaySettings, AiRoute, AiTestResult, SecretHint } from "#shared/api"
import { householdSettings } from "../databases/config"
import { isDemo } from "../demo/mode"
import { seal, unseal } from "./crypto"
import { HTTPError } from "./http-error"

/**
 * How a household reaches Jev, TypeSafe's model for AI categories. Each route is one of ViteHub's AI gateways
 * (`vite-hub/gateways`), which all answer the same questions with `gateway.ask()`:
 *
 * - `typesafe`: TypeSafe's API, with a TypeSafe key.
 * - `vercel`: Vercel AI Gateway, with an AI Gateway key.
 * - `cloudflare`: TypeSafe's API through a Cloudflare AI Gateway custom provider, with a TypeSafe key, the account and
 *   gateway ids, an optional gateway token (authenticated gateways), and the provider's slug (default `typesafe`).
 *
 * The household's owner picks one in Settings › Categories; its secrets are sealed like connection credentials and never
 * go back to the browser. Without one, the household uses the server's own route (nuxt.config.ts `vite.env.server`).
 * Without either, AI categories are off. The demo build never asks Jev.
 */

/** What `ai_credentials` holds, sealed. */
interface Credentials {
  apiKey: string
  accountId?: string
  gatewayId?: string
  token?: string
  slug?: string
}

export interface Route {
  route: AiRoute
  /** `household`: the household's own key; `server`: the server's. */
  source: "household" | "server"
  gateway: AiGateway<{ ask: true }>
}

const present = (value: string | null | undefined) => (value?.trim() ? value.trim() : undefined)

/**
 * The server's own route and credentials (nuxt.config.ts `vite.env.server`), the first that has what it needs: Cloudflare
 * AI Gateway (the TypeSafe key, account, and gateway), TypeSafe (its key), then Vercel AI Gateway (an AI Gateway key).
 * Passed to the preset explicitly, like a household's, instead of the preset's own Env lookup.
 */
function serverCredentials(): { gateway: AiRoute; credentials: Credentials } | null {
  if (isDemo()) return null
  const { cloudflare, typesafe, vercel } = useServerEnv()
  const typesafeKey = present(typesafe.apiKey?.unseal())
  const accountId = present(cloudflare.accountId)
  const gatewayId = present(cloudflare.gatewayId)
  if (typesafeKey && accountId && gatewayId) {
    const token = present(cloudflare.token.unseal())
    const slug = present(cloudflare.slug)
    return { gateway: "cloudflare", credentials: { apiKey: typesafeKey, accountId, gatewayId, ...(token ? { token } : {}), ...(slug ? { slug } : {}) } }
  }
  if (typesafeKey) return { gateway: "typesafe", credentials: { apiKey: typesafeKey } }
  const gatewayKey = present(vercel.apiKey.unseal())
  return gatewayKey ? { gateway: "vercel", credentials: { apiKey: gatewayKey } } : null
}

/** The server's own route, or null when it has no key. */
export const serverRoute = (): AiRoute | null => serverCredentials()?.gateway ?? null

/** The AI gateway of the server's own route. */
export function serverGateway() {
  const server = serverCredentials()
  return server ? gatewayFor(server.gateway, server.credentials) : null
}

async function stored(householdId: string) {
  const [row] = await db
    .select({ gateway: householdSettings.aiGateway, credentials: householdSettings.aiCredentials })
    .from(householdSettings)
    .where(eq(householdSettings.householdId, householdId))
    .limit(1)
  if (!row?.gateway) return null
  const credentials = await unseal<Credentials>(row.credentials)
  return credentials ? { gateway: row.gateway, credentials } : null
}

/** The AI gateway for a route and its credentials. Every value is passed, so no preset falls back to the server's Env. */
export function gatewayFor(route: AiRoute, credentials: Credentials): AiGateway<{ ask: true }> {
  if (route === "typesafe") return typesafe({ apiKey: credentials.apiKey })
  if (route === "vercel") return vercel({ apiKey: credentials.apiKey })
  return cloudflare({
    apiKey: credentials.apiKey,
    accountId: credentials.accountId ?? "",
    gatewayId: credentials.gatewayId ?? "",
    // An open gateway has no token; the preset then leaves out cf-aig-authorization.
    token: credentials.token,
    slug: credentials.slug ?? "typesafe",
  })
}

/** The household's own route when its owner set one, else the server's, else null (AI categories are off). */
export async function routeFor(householdId: string): Promise<Route | null> {
  if (isDemo()) return null
  const own = await stored(householdId)
  if (own) return { route: own.gateway, source: "household", gateway: gatewayFor(own.gateway, own.credentials) }
  const server = serverCredentials()
  return server ? { route: server.gateway, source: "server", gateway: gatewayFor(server.gateway, server.credentials) } : null
}

const hint = (secret: string | undefined): SecretHint | null => (secret ? { last4: secret.slice(-4) } : null)

/** What the owner's form shows: the route and its non-secret fields, and for each secret only that it's set. */
export async function gatewaySettings(householdId: string): Promise<AiGatewaySettings> {
  const own = await stored(householdId)
  return {
    gateway: own?.gateway ?? "server",
    server: serverRoute(),
    apiKey: own ? { kind: own.gateway === "vercel" ? "vercel" : "typesafe", last4: own.credentials.apiKey.slice(-4) } : null,
    cloudflare:
      own?.gateway === "cloudflare"
        ? {
            accountId: own.credentials.accountId ?? "",
            gatewayId: own.credentials.gatewayId ?? "",
            slug: own.credentials.slug ?? "",
            token: hint(own.credentials.token),
          }
        : null,
  }
}

const Secret = v.pipe(v.string(), v.trim(), v.maxLength(500))
const Id = v.pipe(v.string(), v.trim(), v.maxLength(100))

/** The owner's form (`AiGatewayInput`): which route, and its fields. An empty secret keeps the stored one. */
export const AiGatewayBody = v.variant("gateway", [
  v.object({ gateway: v.literal("server") }),
  v.object({ gateway: v.picklist(["typesafe", "vercel"]), apiKey: v.optional(Secret) }),
  v.object({
    gateway: v.literal("cloudflare"),
    apiKey: v.optional(Secret),
    accountId: Id,
    gatewayId: Id,
    token: v.optional(v.nullable(Secret)),
    slug: v.optional(v.pipe(Id, v.regex(/^[a-z0-9-]*$/i, "Use letters, numbers, and dashes."))),
  }),
])

/**
 * The form's values on top of what's stored: an empty key or token keeps the stored one (a TypeSafe key serves both
 * TypeSafe and Cloudflare; an AI Gateway key only Vercel), `token: null` removes the token. Null for "server".
 */
export async function credentialsFrom(householdId: string, input: AiGatewayInput): Promise<{ gateway: AiRoute; credentials: Credentials } | null> {
  if (input.gateway === "server") return null
  const own = await stored(householdId)
  const sameKind = own && (own.gateway === "vercel") === (input.gateway === "vercel")
  const apiKey = present(input.apiKey) ?? (sameKind ? own.credentials.apiKey : undefined)
  if (!apiKey) throw new HTTPError({ status: 400, statusText: "Paste an API key." })
  if (input.gateway !== "cloudflare") return { gateway: input.gateway, credentials: { apiKey } }
  const accountId = present(input.accountId)
  const gatewayId = present(input.gatewayId)
  if (!accountId || !gatewayId) throw new HTTPError({ status: 400, statusText: "Enter the Cloudflare account ID and gateway ID." })
  const token = input.token === null ? undefined : (present(input.token) ?? (own?.gateway === "cloudflare" ? own.credentials.token : undefined))
  const slug = present(input.slug)
  return { gateway: "cloudflare", credentials: { apiKey, accountId, gatewayId, ...(token ? { token } : {}), ...(slug ? { slug } : {}) } }
}

/** Saves the household's route, or clears it to use the server's. */
export async function saveGateway(householdId: string, chosen: Awaited<ReturnType<typeof credentialsFrom>>) {
  const values = chosen
    ? { aiGateway: chosen.gateway, aiCredentials: await seal(chosen.credentials) }
    : { aiGateway: null, aiCredentials: null }
  await db
    .insert(householdSettings)
    .values({ householdId, ...values })
    .onConflictDoUpdate({ target: householdSettings.householdId, set: values })
}

/**
 * One tiny question, to check a route before relying on it: a Noul about a made-up grocery payment, nothing from the
 * household. A failure returns the provider's own answer (their auth error, for a wrong key), never a credential.
 */
export async function testRoute(gateway: AiGateway<{ ask: true }>): Promise<AiTestResult> {
  const started = Date.now()
  let model: string | null = null
  try {
    await gateway.ask(
      { description: "SUPERMARKET 24.10", direction: "money out" },
      { groceries: { type: "chance", instructions: "Is this a grocery purchase?" } },
      { onUsage: (record) => (model ??= record.model ?? null), signal: AbortSignal.timeout(20_000) },
    )
    return { ok: true, model, ms: Date.now() - started }
  } catch (error) {
    return { ok: false, message: describeFailure(error) }
  }
}

function describeFailure(error: unknown) {
  if (!(error instanceof Error)) return String(error).slice(0, 300)
  // ViteHub's diagnostic says which route failed and how; its cause is the provider's response, such as TypeSafe's
  // "Cannot authenticate" or Cloudflare's "Unauthorized".
  const said = providerMessage(error.cause)
  return `${error.message.replace(/^\[vitehub\] /, "")}${said ? ` ${said}` : ""}`.slice(0, 400)
}

/** The provider's own words from advocaat's error: its status and the message in its JSON body. */
function providerMessage(cause: unknown) {
  if (!(cause instanceof Error)) return ""
  const { status, body } = cause as Error & { status?: unknown; body?: unknown }
  const record = (value: unknown) => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined)
  const first = (value: unknown) => (Array.isArray(value) ? value[0] : value)
  const error = record(body)?.error
  const text = [record(first(error))?.message, typeof error === "string" ? error : undefined, record(body)?.message, typeof body === "string" ? body : undefined].find(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  )
  const message = (text ?? cause.message).replace(/\s+/g, " ").trim().slice(0, 160)
  return typeof status === "number" && !message.startsWith(String(status)) ? `(${status}: ${message})` : `(${message})`
}
