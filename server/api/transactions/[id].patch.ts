import { defineHandler } from "h3"
import * as v from "valibot"
import type { Transaction } from "#shared/api"
import { requireMember } from "../../utils/identity"
import { param, readInput } from "../../utils/input"
import { updateTransaction } from "../../utils/transactions"

const Body = v.object({
  categoryId: v.optional(v.nullable(v.string())),
  note: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(1000)))),
  excluded: v.optional(v.boolean()),
  hidden: v.optional(v.boolean()),
  applyToSimilar: v.optional(v.boolean()),
})

export default defineHandler(async (event): Promise<Transaction> => {
  const who = await requireMember(event)
  return updateTransaction(who, param(event), await readInput(event, Body))
})
