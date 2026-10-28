import { defineHandler } from "h3"
import * as v from "valibot"
import { requireMember } from "../utils/identity"
import { readInput } from "../utils/input"
import { updateSetup } from "../utils/setup"
const Body = v.object({ dismissed: v.optional(v.boolean()), sharingReviewed: v.optional(v.boolean()), recurringReviewed: v.optional(v.boolean()), forecastReviewed: v.optional(v.boolean()), checkin: v.optional(v.boolean()) })
export default defineHandler(async event => {
  await updateSetup(await requireMember(event), await readInput(event, Body))
  return { ok: true }
})
