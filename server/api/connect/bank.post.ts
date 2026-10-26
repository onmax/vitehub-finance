import { eq } from "drizzle-orm"
import { defineHandler } from "h3"
import * as v from "valibot"
import { db } from "vite-hub/database/drizzle"
import { connection } from "../../databases/config"
import { fail, findBank, providerHttpError, readValid, requireBankConfig, startBankLink } from "../../utils/connections"
import { requireMember } from "../../utils/identity"

const Body = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  country: v.pipe(v.string(), v.trim(), v.toUpperCase(), v.regex(/^[A-Z]{2}$/, "Use a two-letter country code.")),
})

/** Starts linking a bank: a `pending` connection owned by the caller, and the bank's consent page to open. */
export default defineHandler(async (event) => {
  const who = await requireMember(event)
  const config = requireBankConfig()
  const body = await readValid(event, Body)
  const bank = await findBank(config, body.name, body.country).catch((error) => {
    throw providerHttpError(error)
  })
  if (!bank) throw fail(400, `Enable Banking doesn't list "${body.name}" in ${body.country}.`)
  const [row] = await db
    .insert(connection)
    .values({
      id: crypto.randomUUID(),
      householdId: who.householdId,
      ownerId: who.userId,
      provider: "enable_banking",
      name: bank.name,
      institution: bank.name,
      country: bank.country,
      status: "pending",
    })
    .returning()
  try {
    return { url: await startBankLink(event, who, row!, bank) }
  } catch (error) {
    // Nothing was linked; don't leave a dangling pending connection behind.
    await db.delete(connection).where(eq(connection.id, row!.id))
    throw providerHttpError(error)
  }
})
