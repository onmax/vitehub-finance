import { defineHandler } from "h3"
import { fail, findBank, providerHttpError, requireBankConfig, requireOwnConnection, startBankLink } from "../../../utils/connections"
import { requireMember } from "../../../utils/identity"
import { refuseInDemo } from "../../../demo/mode"

/** A new consent for an existing bank connection. Accounts match by id, then IBAN, so their history stays. */
export default defineHandler(async (event) => {
  refuseInDemo()
  const who = await requireMember(event)
  const row = await requireOwnConnection(who, event.context.params?.id)
  if (row.provider !== "enable_banking") throw fail(400, "Only bank connections can be reconnected. Remove this connection and connect it again.")
  const config = requireBankConfig()
  try {
    const bank = await findBank(config, row.institution ?? row.name, row.country ?? "")
    if (!bank) throw fail(400, `${row.institution ?? row.name} isn't in the bank list anymore. Remove this connection.`, "bankNotListed", { bank: row.institution ?? row.name })
    return { url: await startBankLink(event, who, row, bank) }
  } catch (error) {
    throw providerHttpError(error)
  }
})
