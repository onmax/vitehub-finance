import { defineHandler } from "h3"
import { kv } from "vite-hub/kv"
import { ISIN } from "@vitehub-finance/brokers"
import type { FundMatch } from "#shared/api"
import { searchFunds } from "../../providers/myinvestor"
import { fail, providerHttpError } from "../../utils/connections"
import { requireMember } from "../../utils/identity"

// Morningstar's search can take seconds, and an ISIN finds the same funds all day. Only whole ISINs are kept: every
// keystroke of a name is a new term, and KV writes are counted.
const TTL = 24 * 60 * 60 * 1000

/** Funds, ETFs, and pension plans by ISIN or name (Morningstar), for MyInvestor's connect dialog. */
export default defineHandler(async (event): Promise<FundMatch[]> => {
  await requireMember(event)
  const term = (event.url.searchParams.get("q") ?? "").trim()
  if (term.length < 3 || term.length > 100) throw fail(400, "Search with 3 to 100 characters.")
  const isin = ISIN.test(term.toUpperCase()) ? term.toUpperCase() : null
  const [, cached] = isin ? await kv.get<{ at: number; found: FundMatch[] }>(`funds:${isin}`) : [null, null]
  if (cached && Date.now() - cached.at < TTL) return cached.found
  const found = await searchFunds(term).catch((error) => {
    throw providerHttpError(error)
  })
  if (isin && found.length) await kv.set(`funds:${isin}`, { at: Date.now(), found })
  return found
})
