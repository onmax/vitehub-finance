import { HTTPError } from "./http-error"
import type { Member } from "./identity"

/**
 * Who may send which request, decided from the request alone: the browser-only routes (enforced by `identify`,
 * server/utils/identity.ts) and the same-origin check for cookie requests (server/middleware/same-origin.ts).
 */

export const bearerFrom = (headers: Headers) => headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"])

// A superset of what the router matches (decoded, any case, repeated or trailing slashes), so no spelling of a guarded
// route slips past a guard. Use it to include routes, never to exclude them.
function loosePath(pathname: string) {
  let path = pathname
  try {
    path = decodeURIComponent(pathname)
  } catch {}
  return path.toLowerCase().replace(/[\\/]+/g, "/").replace(/(.)\/$/, "$1")
}

export const BROWSER_ONLY = "Do this in the browser. Agents and API keys can't."

/**
 * Agents (OAuth access tokens) and API keys act as their person for what the consent screen (app/pages/oauth.vue)
 * promises: reading, categorizing, and notes. Deleting, sharing, connecting, and the household stay with the person,
 * in the browser, so a leaked or careless token can't erase an account or expose a private one.
 */
export function requireBrowser(who: Pick<Member, "via">) {
  if (who.via !== "browser") throw new HTTPError({ status: 403, statusText: BROWSER_ONLY })
}

/**
 * The routes only the browser calls: connecting, syncing, re-linking, and removing connections (and the bank's
 * redirect back, which lands in a browser), disconnecting agents, the household and its people, and deleting an
 * account. Changing who sees an account or archiving it is checked in its PATCH (`BROWSER_ONLY_ACCOUNT_FIELDS`).
 */
export function isBrowserOnlyRoute(method: string, pathname: string) {
  const path = loosePath(pathname)
  if (path === "/api/connect/callback") return true
  const verb = method.toUpperCase()
  if (!UNSAFE.has(verb)) return false
  if (/^\/api\/(connect|connections|agents|household)(\/|$)/.test(path)) return true
  return verb === "DELETE" && /^\/api\/accounts\/[^/]+$/.test(path)
}

/** PATCH /api/accounts/:id fields only the browser sends: who sees the account, what they may do, and archiving. */
export const BROWSER_ONLY_ACCOUNT_FIELDS = ["visibility", "householdPermission", "archived"] as const

export const CROSS_SITE = "This request didn't come from ViteHub Finance. Reload the page and try again."
export const NOT_JSON = "Send JSON."

const JSON_TYPE = /^application\/([\w.-]+\+)?json\s*(;|$)/i

/**
 * Why a request signed in by its cookie can't change anything, or null when it may. A cookie goes with requests other
 * sites start (SameSite=Lax still lets a sibling subdomain send one), so an unsafe method must come from this origin,
 * by its Origin (or, without one, its Referer), and carry JSON: a form or `text/plain` body is someone else's page.
 * Bearer requests (agents, API keys) send no cookie and are skipped; so are Better Auth's own routes, which check
 * origins themselves, and the browser error reports, which check theirs (server/handlers/client-errors.ts).
 */
export function crossSiteProblem(request: Request, origin: string): { status: number; message: string } | null {
  if (!UNSAFE.has(request.method.toUpperCase())) return null
  const { pathname } = new URL(request.url)
  if (!loosePath(pathname).startsWith("/api/")) return null
  // Exclusions match the path exactly as routed, so no other spelling of a route escapes the check.
  if (pathname.startsWith("/api/auth/") || pathname === "/api/_evlog/ingest") return null
  const headers = request.headers
  if (bearerFrom(headers)) return null
  const from = headers.get("origin") ?? originOf(headers.get("referer"))
  if (from !== origin) return { status: 403, message: CROSS_SITE }
  const type = headers.get("content-type")
  const hasBody = type !== null || Number(headers.get("content-length") ?? 0) > 0 || headers.has("transfer-encoding")
  if (hasBody && !JSON_TYPE.test(type ?? "")) return { status: 415, message: NOT_JSON }
  return null
}

function originOf(url: string | null) {
  if (!url || !URL.canParse(url)) return null
  return new URL(url).origin
}
