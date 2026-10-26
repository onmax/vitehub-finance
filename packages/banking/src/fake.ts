import { BankingError, type BankingErrorCode } from "./errors.ts"
import type { BankAccount, BankingProvider, BankTransaction, Institution, Money } from "./model.ts"

export interface FakeBank {
  institutions?: Institution[]
  accounts?: Array<BankAccount & { balance?: Money | null; transactions?: BankTransaction[]; fail?: BankingErrorCode }>
  /** Fails every call with this code. */
  fail?: BankingErrorCode
}

/** A bank that answers what you give it: for tests and demos. Its consent page is `${redirectUrl}?code=fake&state=…`. */
export function fake(bank: FakeBank = {}): BankingProvider {
  const failing = (code: BankingErrorCode | undefined) => {
    if (code) throw new BankingError(code, `Fake bank failed with ${code}.`, "fake")
  }
  const find = (uid: string) => {
    const account = bank.accounts?.find((entry) => entry.uid === uid)
    if (!account) throw new BankingError("unavailable", `No fake account ${uid}.`, "fake")
    failing(account.fail)
    return account
  }
  return {
    id: "fake",
    name: "Fake bank",
    async institutions(country) {
      failing(bank.fail)
      return (bank.institutions ?? []).filter((entry) => entry.country === country)
    },
    async authorize(input) {
      failing(bank.fail)
      return `${input.redirectUrl}?${new URLSearchParams({ code: "fake", state: input.state })}`
    },
    async completeAuthorization() {
      failing(bank.fail)
      return {
        id: "fake-consent",
        institution: bank.institutions?.[0] ?? null,
        accounts: (bank.accounts ?? []).map(({ uid, name, iban, currency, kind }) => ({ uid, name, iban, currency, kind })),
        expiresAt: null,
      }
    },
    async balance(_consentId, uid) {
      failing(bank.fail)
      return find(uid).balance ?? null
    },
    async transactions(_consentId, uid, { since } = {}) {
      failing(bank.fail)
      return (find(uid).transactions ?? []).filter((row) => !since || row.date >= since)
    },
    async revoke() {},
  }
}
