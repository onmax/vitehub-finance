import { HTTPError } from "../../utils/http-error"
import { defineHandler } from "h3"
import * as v from "valibot"
import type { Auth } from "better-auth"
import { checkRateLimit } from "vite-hub/rate-limit"
import { DEMO_PEOPLE } from "../../demo/scenario"
import { isDemo } from "../../demo/mode"
import { demoPassword, ensureDemo } from "../../demo/seed"
import { fail, readValid } from "../../utils/connections"
import { authFor } from "../../utils/identity"
import { refuseOverLimit } from "../../utils/rate-limit"

const Body = v.object({ as: v.picklist(["lucia", "pablo"]) })

/**
 * Enters the demo as Lucía or Pablo: seeds the household if it isn't there, signs in server-side through Better Auth,
 * and forwards its session cookie. Only demo builds answer; everywhere else this is a 404. Anyone may call it, so each
 * client address gets ten sessions a minute: enough to arrive and switch people, not to fill the session table.
 */
export default defineHandler(async (event) => {
  if (!isDemo()) throw new HTTPError({ status: 404, statusText: "Not Found" })
  refuseOverLimit(await checkRateLimit(event, "demo-session", { limit: 10, window: "1m" }))
  const { as } = await readValid(event, Body)
  await ensureDemo()
  const auth = authFor(event) as unknown as Auth
  // Switching people: end the current demo session instead of leaving it behind.
  await auth.api.signOut({ headers: event.req.headers }).catch(() => null)
  const response = await auth.api.signInEmail({
    body: { email: DEMO_PEOPLE[as].email, password: await demoPassword(as) },
    headers: event.req.headers,
    asResponse: true,
  })
  if (!response.ok) throw fail(502, "Couldn't open the demo. Try again in a minute.")
  for (const cookie of response.headers.getSetCookie()) event.res.headers.append("set-cookie", cookie)
  return { ok: true }
})
