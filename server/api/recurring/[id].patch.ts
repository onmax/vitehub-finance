import { defineHandler } from "h3"
import * as v from "valibot"
import type { Recurring } from "#shared/api"
import { requireMember } from "../../utils/identity"
import { param, readInput } from "../../utils/input"
import { updateRecurringStatus } from "../../utils/recurring"

const Body = v.object({ status: v.picklist(["detected", "confirmed", "dismissed"]) })

export default defineHandler(async (event): Promise<Recurring> => {
  const who = await requireMember(event)
  const { status } = await readInput(event, Body)
  return updateRecurringStatus(who, param(event), status)
})
