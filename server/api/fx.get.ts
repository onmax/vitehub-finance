import { HTTPError } from "../utils/http-error"
import { defineHandler } from "h3"
import type { FxRates } from "#shared/api"
import { isCurrency } from "#shared/money"
import { ratesWithTime } from "../utils/fx"
import { requireMember } from "../utils/identity"

/** Today's ECB rates into one currency (`?to=SEK`), for showing amounts in the currency someone picked. */
export default defineHandler(async (event): Promise<FxRates> => {
  await requireMember(event)
  const to = event.url.searchParams.get("to")
  if (!isCurrency(to)) throw new HTTPError({ status: 400, statusText: "to must be a supported currency code." })
  const { at, rates } = await ratesWithTime(to)
  return { currency: to, rates, updatedAt: at ? new Date(at).toISOString() : null }
})
