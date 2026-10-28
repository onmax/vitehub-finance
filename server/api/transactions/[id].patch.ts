import { defineHandler } from "h3"
import type { Transaction } from "#shared/api"
import { requireMember } from "../../utils/identity"
import { param, readInput } from "../../utils/input"
import { TransactionChangeSchema, updateTransaction } from "../../utils/transactions"

export default defineHandler(async (event): Promise<Transaction> => {
  const who = await requireMember(event)
  return updateTransaction(who, param(event), await readInput(event, TransactionChangeSchema))
})
