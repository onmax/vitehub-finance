import { useLogger } from "evlog/nitro/v3"
import { defineHandler, HTTPError, noContent } from "h3"
import * as v from "valibot"
import { requireRateLimit } from "vite-hub/rate-limit"
import { identify } from "../utils/identity"

const Text = (max: number) => v.optional(v.pipe(v.string(), v.transform((text) => text.slice(0, max))))

/** What app/utils/client-errors.ts sends through evlog's client transport: one error, already capped in the browser. */
const Body = v.object({
  level: v.picklist(["error", "warn"]),
  clientError: v.object({
    kind: v.picklist(["vue", "unhandled", "toast", "load"]),
    // The page's path, never its query (a search, a filter, an OAuth code).
    path: v.pipe(v.string(), v.startsWith("/"), v.transform((path) => path.split(/[?#]/)[0]!.slice(0, 300))),
    name: Text(120),
    message: v.pipe(v.string(), v.transform((text) => text.slice(0, 1000))),
    stack: Text(4000),
    // Vue's lifecycle hint ("setup function", "render function"), a toast's title, the failed request.
    info: Text(200),
    title: Text(200),
    request: Text(300),
    status: v.optional(v.pipe(v.number(), v.integer())),
  }),
})

const MAX_BYTES = 16 * 1024

/**
 * Errors from the browser (POST /api/_evlog/ingest): a crashed component, an unhandled rejection, a request that ended
 * in an error toast or a "This didn't load". Each becomes an error-level wide event with the page's path, so a toast
 * leaves a trace next to the server's own events. Same-origin only, rate limited, and the sender's ids only when signed
 * in; the browser never sends who it is.
 */
export default defineHandler(async (event) => {
  const origin = event.req.headers.get("origin")
  if (origin && origin !== event.url.origin) throw new HTTPError({ status: 403, statusText: "Cross-origin reports aren't accepted." })
  await requireRateLimit(event, "client-error", { limit: 20, window: "1m" })
  const raw = await event.req.text()
  if (raw.length > MAX_BYTES) throw new HTTPError({ status: 413, statusText: "Report too large." })
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new HTTPError({ status: 400, statusText: "Send JSON." })
  }
  const parsed = v.safeParse(Body, json)
  if (!parsed.success) throw new HTTPError({ status: 400, statusText: "Not a client error report." })
  const report = parsed.output.clientError
  // Puts the user and household on the event when the browser is signed in.
  await identify(event)
  const error = Object.assign(new Error(report.message), { name: report.name || "Error", stack: report.stack })
  const { message: _message, name: _name, stack: _stack, ...client } = report
  useLogger(event).error(error, { action: "client-error", client })
  return noContent()
})
