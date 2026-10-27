import { defineHandler } from "h3"
import * as v from "valibot"
import type { AlertSettings } from "#shared/api"
import { saveAlertSettings } from "../../utils/alerts"
import { requireMember } from "../../utils/identity"
import { readInput } from "../../utils/input"

const minor = v.pipe(v.number(), v.integer(), v.minValue(-1_000_000_000_00), v.maxValue(1_000_000_000_00))
const Settings = v.object({
  budget: v.object({ enabled: v.boolean(), percent: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)) }),
  lowBalance: v.object({ enabled: v.boolean(), thresholdMinor: minor }),
  largeTransaction: v.object({ enabled: v.boolean(), thresholdMinor: v.pipe(minor, v.minValue(1)) }),
  priceIncrease: v.object({ enabled: v.boolean() }),
})

/** What the caller is alerted about, and at which thresholds (amounts in the household's currency). */
export default defineHandler(async (event): Promise<AlertSettings> => {
  const who = await requireMember(event)
  return saveAlertSettings(who, await readInput(event, Settings))
})
