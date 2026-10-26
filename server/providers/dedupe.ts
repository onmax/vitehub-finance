// What makes a transaction "the same one" across fetches, and the rules that categorize new ones. Pure logic, so the
// sync engine, the CSV import, and the tests share it.
import { currencyDigits } from "../../shared/money"

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
const sha256 = async (text: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))

export const normalizeText = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim()

/**
 * One dedupe key per row, in order. A provider id wins (`id:<id>`); without one, a hash of date|amount|description|n,
 * where n counts identical rows earlier in the same fetch, so two equal coffees on one day stay two rows and a refetch of
 * the same window yields the same keys.
 */
export async function dedupeKeys(
  rows: Array<{ externalId?: string | null; date: string; amountMinor: number; description: string }>,
) {
  const seen = new Map<string, number>()
  const keys: string[] = []
  for (const row of rows) {
    if (row.externalId) {
      keys.push(`id:${row.externalId}`)
      continue
    }
    const base = `${row.date}|${row.amountMinor}|${normalizeText(row.description)}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    keys.push(`h:${toHex(await sha256(`${base}|${n}`)).slice(0, 32)}`)
  }
  return keys
}

/**
 * A decimal string ("-12.30", "1234.5") to integer minor units without float rounding surprises. Null when unreadable.
 */
export function decimalToMinor(value: string | number, currency: string): number | null {
  const digits = currencyDigits(currency)
  const text = typeof value === "number" ? value.toFixed(Math.max(digits, 8)) : value.trim()
  const match = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(text)
  if (!match || (!match[2] && !match[3])) return null
  const [, sign, whole = "", fraction = ""] = match
  const padded = (fraction + "0".repeat(digits + 1)).slice(0, digits + 1)
  // One extra digit rounds half away from zero.
  let minor = Number(whole || "0") * 10 ** digits + Number(padded.slice(0, digits) || "0")
  if (Number(padded[digits]) >= 5) minor += 1
  return sign === "-" ? -minor : minor
}

/** `YYYY-MM-DD` and a real calendar day. */
export function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export interface Rule {
  match: string
  categoryId: string
}

/** Whether `needle` starts a word in `haystack` (both lowercase): "fee" matches "Bank fee", not "Coffee". */
export function startsWord(haystack: string, needle: string) {
  for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, index + 1))
    if (index === 0 || !/[\p{L}\p{N}]/u.test(haystack[index - 1]!)) return true
  return false
}

/**
 * The category for a row: the rule whose `match` (case-insensitive) starts a word in the description or counterparty;
 * the longest match wins. server/utils/categorize.ts `ruleMatches` is the same test in SQL.
 */
export function categorize(rules: Rule[], row: { description: string; counterparty?: string | null }) {
  const haystack = `${row.description.toLowerCase()}\n${(row.counterparty ?? "").toLowerCase()}`
  let best: Rule | null = null
  for (const rule of rules) {
    const needle = rule.match.toLowerCase()
    if (!needle.trim() || !startsWord(haystack, needle)) continue
    if (!best || needle.length > best.match.length) best = rule
  }
  return best?.categoryId ?? null
}
