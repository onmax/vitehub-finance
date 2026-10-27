import { defineHandler } from "h3"
import * as v from "valibot"
import { dismissAlert } from "../../utils/alerts"
import { requireMember } from "../../utils/identity"
import { readInput } from "../../utils/input"

/** Dismisses one alert for the caller (`{ key }`); a new alert about the same thing still shows. */
export default defineHandler(async (event) => {
  const who = await requireMember(event)
  const { key } = await readInput(event, v.object({ key: v.pipe(v.string(), v.minLength(1), v.maxLength(300)) }))
  await dismissAlert(who, key)
  return { ok: true }
})
