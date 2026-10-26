import { BankingError } from "./errors.ts"
import type { BankAccount, BankingProvider, BankTransaction, Money } from "./model.ts"

export type AccountRead =
  | { account: BankAccount; balance: Money | null; transactions: BankTransaction[]; error: null }
  | { account: BankAccount; balance: null; transactions: null; error: BankingError }

/**
 * Every account's balance and transactions under one consent. One account failing keeps the others. An expired consent
 * or rejected app credentials apply to all of them, so those throw; a rate limit stops the calls that are left and
 * marks those accounts, unless nothing was read yet (then it throws, so a retry can come later).
 */
export async function readAccounts(
  provider: BankingProvider,
  consentId: string,
  accounts: BankAccount[],
  options: { since?: string | null } = {},
): Promise<AccountRead[]> {
  const reads: AccountRead[] = []
  let stopped: BankingError | null = null
  for (const account of accounts) {
    if (stopped) {
      reads.push({ account, balance: null, transactions: null, error: stopped })
      continue
    }
    try {
      const balance = await provider.balance(consentId, account.uid)
      const transactions = await provider.transactions(consentId, account.uid, options)
      reads.push({ account, balance, transactions, error: null })
    } catch (cause) {
      const error = cause instanceof BankingError ? cause : new BankingError("unavailable", cause instanceof Error ? cause.message : String(cause), provider.id)
      if (error.code === "expired" || error.code === "invalid_credentials") throw error
      if (error.code === "rate_limited") {
        if (!reads.some((read) => !read.error)) throw error
        stopped = error
      }
      reads.push({ account, balance: null, transactions: null, error })
    }
  }
  return reads
}
