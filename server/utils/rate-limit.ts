import type { RateLimitDecision } from "vite-hub/rate-limit"
import { HTTPError } from "./http-error"

const TOO_MANY_TRIES = "Too many tries. Wait a minute and try again."

/**
 * Turns a `checkRateLimit` verdict into the app's answer: nothing when allowed, a 429 the browser translates (with
 * Retry-After), or a 503 when the limiter itself is down. Call sites keep `checkRateLimit` with literal options:
 * ViteHub reads them at build time to create each limit.
 */
export function refuseOverLimit(decision: RateLimitDecision) {
  if (decision.allowed) return
  if (decision.reason === "unavailable") throw new HTTPError({ status: 503, statusText: "Try again later.", message: "Try again later." })
  throw new HTTPError({
    status: 429,
    statusText: TOO_MANY_TRIES,
    message: TOO_MANY_TRIES,
    ...(decision.retryAfter === undefined ? {} : { headers: { "retry-after": String(decision.retryAfter) } }),
  })
}
