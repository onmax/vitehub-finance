import { defineHandler } from "h3"
import * as v from "valibot"
import { restoreAlert } from "../../utils/alerts"
import { requireMember } from "../../utils/identity"
import { readInput } from "../../utils/input"

/** Brings a dismissed alert back for the caller (`{ key }`). */
export default defineHandler(async (event) => {
  const who = await requireMember(event)
  const { key } = await readInput(event, v.object({ key: v.pipe(v.string(), v.minLength(1), v.maxLength(300)) }))
  await restoreAlert(who, key)
  return { ok: true }
})
