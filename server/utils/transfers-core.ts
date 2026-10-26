// Money moved between a household's own accounts is neither spending nor income. Pure logic: which rows are such moves,
// and which outflow pairs with which inflow. server/utils/transfers.ts reads and writes the database around it.

export interface TransferCandidate {
  id: string
  accountId: string
  ownerId: string
  /** A private account pairs only with accounts of the same owner, so a pair never hints at it. */
  private: boolean
  /** The account owner's name: a payment to or from yourself is a move between your accounts. */
  ownerName?: string | null
  date: string
  amountMinor: number
  currency: string
  description: string
  counterparty: string | null
}

/** The same move booked on two accounts can land a few days apart (weekends, card settlement). */
export const PAIR_DAYS = 4
/** Across currencies the bank's rate differs from today's ECB rate: 5% covers card spreads and months of drift. */
export const FX_TOLERANCE = 0.05

/**
 * Rows that say they are a move between your own money, whatever the other side: currency exchanges inside one bank,
 * top-ups from your own card, pockets and vaults, and deposits at brokers and crypto exchanges (still your money).
 */
const PATTERNS = [
  /^exchanged (to|from) [a-z]{3}\b/i,
  /^(top-up|top up|topup) (by|from)\b/i,
  /\b(to|from) (pocket|vault|savings vault|savings pocket)\b/i,
  /\b(transfer|traspaso|transferencia) (to|from|between|entre) (own|my|your|mis|cuentas propias)\b/i,
  /\b(traspaso|transferencia) (a|desde|de) (la )?cuenta (propia|com[uú]n|ahorro|n[oó]mina|naranja)\b/i,
  // Paying off a credit card moves money from the current account to the card's.
  /\b(liquidaci[oó]n|pago liquidaci[oó]n) (de )?(la )?tarjeta\b|\bcredit card (payment|repayment)\b/i,
  /\b(ibkr|interactive brokers|degiro|trade republic|scalable capital|myinvestor|indexa capital|bitvavo|kraken|coinbase|binance)\b/i,
]

const words = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/** Every word of the owner's name appears in the text: "Payment from Alex Javier Moreno Ruiz" for Álex Moreno Ruíz. */
export function namesOwner(text: string, ownerName: string | null | undefined) {
  const name = words(ownerName ?? "")
  if (name.length < 2) return false
  const present = new Set(words(text))
  return name.every((word) => present.has(word))
}

/** A refund names you as its counterparty, but it is money back from a shop. */
const REFUND = /^(refund|reembolso|devoluci[oó]n|rückerstattung|återbetalning)\b/i

export function looksLikeTransfer(row: Pick<TransferCandidate, "description" | "counterparty" | "ownerName">) {
  const text = `${row.description}\n${row.counterparty ?? ""}`
  if (REFUND.test(row.description.trim())) return false
  return PATTERNS.some((pattern) => pattern.test(text)) || namesOwner(text, row.ownerName)
}

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000

/**
 * Pairs each outflow with at most one inflow on another account: same amount in the same currency, or within
 * `FX_TOLERANCE` once both are in the household's currency, at most `PAIR_DAYS` apart, and at least one side reads like
 * a transfer (two unrelated payments of about the same amount stay apart). Larger moves pair first, and each picks the
 * closest amount, then the closest day. `toBase` converts minor units to the household currency.
 */
export function pairTransfers(rows: TransferCandidate[], toBase: (minor: number, currency: string) => number) {
  const inflows = rows.filter((row) => row.amountMinor > 0)
  const outflows = rows.filter((row) => row.amountMinor < 0).sort((a, b) => a.amountMinor - b.amountMinor)
  const hinted = new Set(rows.filter((row) => looksLikeTransfer(row)).map((row) => row.id))
  const used = new Set<string>()
  const pairs: Array<{ out: TransferCandidate; in: TransferCandidate }> = []
  for (const out of outflows) {
    const outBase = toBase(-out.amountMinor, out.currency)
    let best: { row: TransferCandidate; gap: number; days: number } | null = null
    for (const candidate of inflows) {
      if (used.has(candidate.id) || candidate.accountId === out.accountId) continue
      if (!hinted.has(out.id) && !hinted.has(candidate.id)) continue
      if ((out.private || candidate.private) && out.ownerId !== candidate.ownerId) continue
      const days = Math.abs(dayNumber(candidate.date) - dayNumber(out.date))
      if (days > PAIR_DAYS) continue
      let gap: number
      if (candidate.currency === out.currency) {
        if (candidate.amountMinor !== -out.amountMinor) continue
        gap = 0
      } else {
        const inBase = toBase(candidate.amountMinor, candidate.currency)
        gap = Math.abs(inBase - outBase) / Math.max(inBase, outBase, 1)
        if (gap > FX_TOLERANCE) continue
      }
      if (!best || gap < best.gap || (gap === best.gap && days < best.days)) best = { row: candidate, gap, days }
    }
    if (!best) continue
    used.add(best.row.id)
    pairs.push({ out, in: best.row })
  }
  return pairs
}
