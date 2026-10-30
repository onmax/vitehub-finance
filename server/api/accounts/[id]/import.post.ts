import { useLogger } from "evlog/nitro/v3"
import { defineHandler, getRouterParam } from "h3"
import * as v from "valibot"
import { fail, readValid } from "../../../utils/connections"
import { requireAccount } from "../../../utils/access"
import { requireMember } from "../../../utils/identity"
import { ImportRows, importRows } from "../../../utils/import"

const Body = v.object({ rows: ImportRows })

/** Rows from a CSV (parsed in the browser) into an account the caller may edit. Importing the same file twice adds nothing. */
export default defineHandler(async (event) => {
  const who = await requireMember(event)
  const id = getRouterParam(event, "id")
  if (!id) throw fail(404, "No such account.")
  const account = await requireAccount(who, id, "edit")
  const { rows } = await readValid(event, Body)
  const log = useLogger(event)
  log.set({ action: "csv-import" })
  return importRows(account, rows, log)
})
