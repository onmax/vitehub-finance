/**
 * The demo's people share two identities among every visitor, so nothing a visitor does may change what the next one
 * sees: for them, `/api/**` is read-only (server/middleware/demo-read-only.ts). These are the writes the demo needs to
 * work at all. Language, display currency, and appearance stay in the browser for them (app/composables).
 */
const DEMO_WRITES = new Set([
  // Entering the demo, and switching between Lucía and Pablo.
  "/api/demo/session",
  // Leaving it.
  "/api/auth/sign-out",
  // Browser error reports (server/handlers/client-errors.ts).
  "/api/_evlog/ingest",
])

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/** Whether a demo person may make this request. Anything outside `/api/` is the SPA, MCP, or OAuth discovery. */
export function demoPersonMay(method: string, pathname: string) {
  if (SAFE_METHODS.has(method.toUpperCase())) return true
  if (!pathname.startsWith("/api/")) return true
  return DEMO_WRITES.has(pathname)
}
