import type { H3Event } from "h3"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "vite-hub/database/drizzle"
import { kv } from "vite-hub/kv"
import { useRuntimeConfig } from "nitro/runtime-config"
import { useServerEnv } from "#vitehub/env/server"
import { sendsEmail } from "#mailer"
import type { BankCheck, SetupCheck } from "#shared/api"
import { connection } from "../databases/config"
import { bankApplication, type EnableBankingConfig } from "../providers/enable-banking"
import { ProviderError } from "../providers/types"
import { serverRoute } from "./ai-gateway"
import { bankConfig } from "./connections"
import type { Member } from "./identity"
import { parseOrigin } from "./origin"

/** Asks Enable Banking about the app the configured key signs for. A key it can't use at all is `rejected` too. */
async function bankCheck(config: EnableBankingConfig | null, callbackUrl: string): Promise<BankCheck> {
  if (!config) return { state: "missing" }
  try {
    const app = await bankApplication(config)
    return { state: "ready", environment: app.environment, active: app.active, redirectRegistered: app.redirectUrls.includes(callbackUrl) }
  } catch (error) {
    return error instanceof ProviderError && (error.code === "unavailable" || error.code === "rate_limited") ? { state: "unreachable" } : { state: "rejected" }
  }
}

/** What the setup guide checks. The callback is this request's origin, the same one `startBankLink` sends banks back to. */
export async function setupCheck(event: H3Event, who: Pick<Member, "userId">): Promise<SetupCheck> {
  const env = useServerEnv()
  const config = useRuntimeConfig()
  const callbackUrl = `${event.url.origin}/api/connect/callback`
  const [, remembered] = await kv.get<string>("app:origin")
  const [bank] = await db
    .select({ id: connection.id })
    .from(connection)
    .where(and(eq(connection.ownerId, who.userId), eq(connection.provider, "enable_banking"), inArray(connection.status, ["active", "expired", "error"])))
    .limit(1)
  const built = parseOrigin(config.origin)
  const configured = parseOrigin(env.finance.origin)
  const firstVisit = parseOrigin(remembered)
  return {
    runs: import.meta.dev ? "dev" : config.public.host === "node" ? "node" : "cloudflare",
    callbackUrl,
    banks: await bankCheck(bankConfig(), callbackUrl),
    bankConnected: Boolean(bank),
    email: sendsEmail,
    ai: serverRoute(),
    signUp: env.finance.allowedEmails.unseal()?.trim() ? "allowed" : "anyone",
    links: built
      ? { origin: built, from: "domain" }
      : configured
        ? { origin: configured, from: "origin" }
        : firstVisit
          ? { origin: firstVisit, from: "first-visit" }
          : { origin: null, from: null },
    contactEmail: Boolean(env.finance.contactEmail?.trim()),
  }
}
