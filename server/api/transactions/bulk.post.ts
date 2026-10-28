import { defineHandler } from "h3"
import { requireMember } from "../../utils/identity"
import { readInput } from "../../utils/input"
import { bulkUpdateTransactions, TransactionBulkSchema } from "../../utils/transactions"

export default defineHandler(async (event) => bulkUpdateTransactions(await requireMember(event), await readInput(event, TransactionBulkSchema)))
