import { defineHandler } from "h3"
import { isDemo, refuseDemoPerson } from "../demo/mode"
import { demoPersonMay } from "../demo/read-only"
import { identify } from "../utils/identity"

/**
 * The public demo is read-only for its people, whoever drives them (the browser, an agent, an API key): every write
 * under `/api/` answers 403 "Not available in the demo." except entering, leaving, and error reports
 * (server/demo/read-only.ts). Other builds skip it without looking up anyone.
 */
export default defineHandler(async (event) => {
  if (!isDemo() || demoPersonMay(event.req.method, event.url.pathname)) return
  const who = await identify(event)
  if (who) refuseDemoPerson(who)
})
