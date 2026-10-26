import { defineHandler } from "h3"
import type { Forecast } from "#shared/api"
import { scopeOf } from "../utils/access"
import { forecast } from "../utils/forecast"
import { requireMember } from "../utils/identity"

export default defineHandler(async (event): Promise<Forecast> => {
  const who = await requireMember(event)
  const months = Math.min(24, Math.max(1, Number.parseInt(event.url.searchParams.get("months") ?? "6", 10) || 6))
  return forecast(who, scopeOf(event), months)
})
