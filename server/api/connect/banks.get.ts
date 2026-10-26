import { defineHandler } from "h3"
import type { Bank } from "#shared/api"
import { banksIn, fail, providerHttpError, requireBankConfig, toBank } from "../../utils/connections"
import { requireMember } from "../../utils/identity"

/** The banks Enable Banking reaches in a country (ISO 3166 alpha-2), for personal accounts, by name. */
export default defineHandler(async (event): Promise<Bank[]> => {
  await requireMember(event)
  const config = requireBankConfig()
  const country = (event.url.searchParams.get("country") ?? "").trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) throw fail(400, "country must be a two-letter code, like ES.")
  const banks = await banksIn(config, country).catch((error) => {
    throw providerHttpError(error)
  })
  return banks
    .filter((bank) => !bank.psu_types?.length || bank.psu_types.includes("personal"))
    .map(toBank)
    .sort((a, b) => a.name.localeCompare(b.name))
})
