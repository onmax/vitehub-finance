/**
 * Which origin links in emails use (the daily Schedule's reconnect reminders have no request to read one from). A
 * request's origin comes from its Host header, which anyone can set, so it never replaces one the server already has.
 *
 * - `built`: `https://<FINANCE_DOMAIN>` when the build knows its domain (Cloudflare custom domains).
 * - `configured`: FINANCE_ORIGIN, for hosts built without one (a Node server behind a proxy).
 * - `remembered`: otherwise, the first origin someone connected something from, kept in KV for good.
 */
export interface OriginSettings {
  built: string
  configured: string
  remembered: string | null
}

/** An http(s) URL's origin ("https://finance.example.com/" gives "https://finance.example.com"), or null. */
export function parseOrigin(value: string | null | undefined) {
  if (!value?.trim()) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null
  } catch {
    return null
  }
}

export const linkOrigin = (settings: OriginSettings) =>
  parseOrigin(settings.built) ?? parseOrigin(settings.configured) ?? parseOrigin(settings.remembered)

/** A request's origin is worth keeping only when the server has none: no domain, no FINANCE_ORIGIN, nothing remembered. */
export const remembersRequestOrigin = (settings: OriginSettings) => linkOrigin(settings) === null
