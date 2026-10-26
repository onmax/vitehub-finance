// Enable Banking's shapes to the package's model. Pure, so tests feed it recorded responses.
import { decimalToMinor } from "../money.ts"
import type { BankAccount, BankAccountKind, BankTransaction } from "../model.ts"

export interface Aspsp {
  name: string
  country: string
  logo?: string | null
  maximum_consent_validity?: number | null
  psu_types?: string[]
}

export interface SessionAccount {
  uid: string
  account_id?: { iban?: string | null } | null
  /** The account holder's name, not the account's. */
  name?: string | null
  details?: string | null
  product?: string | null
  currency?: string | null
  cash_account_type?: string | null
}

export interface EbBalance {
  balance_amount?: { amount: string; currency: string }
  balance_type?: string
}

export interface EbTransaction {
  entry_reference?: string | null
  transaction_id?: string | null
  transaction_amount: { amount: string; currency: string }
  credit_debit_indicator?: "CRDT" | "DBIT" | string | null
  booking_date?: string | null
  value_date?: string | null
  transaction_date?: string | null
  remittance_information?: string[] | null
  creditor?: { name?: string | null } | null
  debtor?: { name?: string | null } | null
  status?: string | null
}

export function accountKind(cashAccountType: string | null | undefined): BankAccountKind {
  switch ((cashAccountType ?? "").toUpperCase()) {
    case "SVGS":
    case "MOMA":
    case "ONDP":
      return "savings"
    case "CARD":
      return "credit"
    case "LOAN":
    case "MGLN":
      return "loan"
    default:
      return "checking"
  }
}

/**
 * An account's name from the session. `name` is the account holder (a person's name, the same on every account), so it
 * never names the account: the bank and currency do ("Revolut SEK"), with the product when the bank sends one and the
 * IBAN's last digits when two accounts would share a name.
 */
export function sessionAccount(account: SessionAccount, bank?: string | null, ambiguous = false): BankAccount {
  const iban = account.account_id?.iban || null
  const currency = account.currency || "EUR"
  const product = account.product?.trim() && account.product.trim() !== account.name?.trim() ? account.product.trim() : null
  const base = [bank, product, currency].filter(Boolean).join(" ") || account.details || "Bank account"
  return { uid: account.uid, name: ambiguous && iban ? `${base} ···${iban.slice(-4)}` : base, iban, currency, kind: accountKind(account.cash_account_type) }
}

/** Names for every account of a session; two that would read the same get their IBAN's last digits. */
export function sessionAccounts(accounts: SessionAccount[], bank?: string | null) {
  const plain = accounts.map((account) => sessionAccount(account, bank))
  const counts = new Map<string, number>()
  for (const info of plain) counts.set(info.name, (counts.get(info.name) ?? 0) + 1)
  return accounts.map((account, index) => (counts.get(plain[index]!.name)! > 1 ? sessionAccount(account, bank, true) : plain[index]!))
}

const BALANCE_PREFERENCE = ["ITAV", "CLAV", "ITBD", "CLBD", "XPCD"]

/** The balance people expect to see: available before booked, interim before closing. */
export function pickBalance(balances: EbBalance[]) {
  const usable = balances.filter((balance) => balance.balance_amount?.amount !== undefined)
  for (const type of BALANCE_PREFERENCE) {
    const match = usable.find((balance) => balance.balance_type === type)
    if (match) return match.balance_amount!
  }
  return usable[0]?.balance_amount ?? null
}

/**
 * Bank rows to the model: debits negative, the description from the remittance lines (else the counterparty), the
 * counterparty being whoever is on the other side (the creditor of a debit, the debtor of a credit). Rows without a date
 * or a readable amount are skipped.
 */
export function mapTransactions(rows: EbTransaction[]): BankTransaction[] {
  const mapped: BankTransaction[] = []
  for (const row of rows) {
    const currency = row.transaction_amount?.currency || "EUR"
    const absolute = decimalToMinor(String(row.transaction_amount?.amount ?? "").replace(/^-/, ""), currency)
    const date = row.booking_date || row.value_date || row.transaction_date
    if (absolute === null || !date) continue
    const debit = row.credit_debit_indicator === "DBIT" || (!row.credit_debit_indicator && String(row.transaction_amount.amount).startsWith("-"))
    const counterparty = (debit ? row.creditor?.name : row.debtor?.name)?.trim() || null
    const remittance = (row.remittance_information ?? [])
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
    mapped.push({
      externalId: row.transaction_id || row.entry_reference || null,
      date: date.slice(0, 10),
      amountMinor: debit ? -absolute : absolute,
      currency,
      description: remittance || counterparty || (debit ? "Payment" : "Deposit"),
      counterparty,
    })
  }
  return mapped
}

export const toInstitution = (aspsp: Aspsp) => ({
  name: aspsp.name,
  country: aspsp.country,
  logo: aspsp.logo ?? null,
  maxConsentDays: aspsp.maximum_consent_validity ? Math.floor(aspsp.maximum_consent_validity / 86_400) : null,
  personal: !aspsp.psu_types?.length || aspsp.psu_types.includes("personal"),
})
