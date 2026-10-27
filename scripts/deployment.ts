export const HOSTS = ["cloudflare", "node"] as const
export type Host = (typeof HOSTS)[number]

const isHost = (value: string): value is Host => HOSTS.some((host) => host === value)

/**
 * Build-time choices: where ViteHub Finance runs and which optional services the build includes. Credentials stay runtime
 * settings (nuxt.config.ts `vite.env.server`), so changing a key never needs a rebuild.
 *
 * - `cloudflare`: a Worker with D1, KV, Cron Triggers, and a Queue that syncs one connection per message.
 * - `node`: one Node process (a VPS, Docker, a home server) with SQLite on disk, KV files, and an in-process cron.
 *   Syncs run inline, one connection after another.
 *
 * `FINANCE_DEMO=1` builds a public instance: anyone can sign up and use it with their own data (`FINANCE_ALLOWED_EMAILS`
 * is ignored, no bank connections), and the login page also offers a fictional household, reset every night, whose two
 * people can't manage sign-in, people, banks, or connections (server/demo). On Cloudflare it has no Queue: syncs run
 * inline, so it can share an account with a private instance's queue.
 */
export function deployment(env: Record<string, string | undefined> = process.env) {
  const preset = env.NITRO_PRESET || env.SERVER_PRESET
  const presetHost = preset?.startsWith("node") ? "node" : preset?.startsWith("cloudflare") ? "cloudflare" : undefined
  const host = env.FINANCE_HOST || presetHost || "cloudflare"
  if (!isHost(host)) throw new Error(`FINANCE_HOST must be one of ${HOSTS.join(", ")}; got "${host}".`)
  if (presetHost && presetHost !== host) throw new Error(`FINANCE_HOST=${host} conflicts with the ${preset} preset.`)

  // Email is optional. Without it ViteHub Finance shows invitation and sign-in links on screen instead of sending them.
  const email = env.FINANCE_EMAIL || (env.RESEND_API_KEY ? "resend" : "")
  if (email && email !== "resend" && email !== "cloudflare")
    throw new Error(`FINANCE_EMAIL must be resend, cloudflare, or empty; got "${email}".`)

  const demo = ["1", "true"].includes((env.FINANCE_DEMO ?? "").trim().toLowerCase())

  return { host, email: email as "" | "resend" | "cloudflare", demo }
}
