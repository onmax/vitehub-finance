import { createUserAgentEnricher } from "evlog/enrichers"
import { definePlugin } from "nitro"

const userAgent = createUserAgentEnricher()

/**
 * Shapes evlog's wide events before they're printed (the evlog module in nuxt.config.ts makes one per request).
 *
 * - A request answered with a 4xx (signed out, a typo in a form, a missing account) is the caller's mistake, not the
 *   server's: it prints at warn, so `level = error` means something broke. Client errors stay errors whatever the status.
 * - Client errors get the browser and OS, parsed from the user agent, to tell a Safari-only bug from the rest.
 */
export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("evlog:enrich", (context) => {
    const { event } = context
    if (event.action === "client-error") return userAgent(context)
    const status = typeof event.status === "number" ? event.status : 0
    if (event.level === "error" && status >= 400 && status < 500) event.level = "warn"
  })
})
