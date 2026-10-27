// Money is integer minor units (cents) everywhere outside the UI; these turn it into text and back.

/** Currencies a household keeps its totals in, and a person can see amounts in: all have daily ECB rates. */
export const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "MXN", "JPY"] as const
export type Currency = (typeof CURRENCIES)[number]
export const isCurrency = (value: unknown): value is Currency => typeof value === "string" && (CURRENCIES as readonly string[]).includes(value)

/** Digits after the decimal point for a currency: 0 for JPY, 2 for EUR. */
export function currencyDigits(currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2
}

export const toMinor = (amount: number, currency = "EUR") => Math.round(amount * 10 ** currencyDigits(currency))
export const fromMinor = (minor: number, currency = "EUR") => minor / 10 ** currencyDigits(currency)

/**
 * Converts minor units with a table of rates into `to` (units of each currency per one `to`, as the ECB publishes them),
 * minding that JPY has no cents and EUR two. Null when the table has no rate for `from`.
 */
export function convertWithRates(rates: Record<string, number>, minor: number, from: string, to: string): number | null {
  if (from === to) return minor
  const rate = rates[from]
  return rate ? toMinor(fromMinor(minor, from) / rate, to) : null
}

/**
 * Parses "1.234,56", "1,234.56", "-12.5", "€ 3,00", "(4.20)" into a number, or null. With both separators the last one
 * is decimal. With one kind, it is a thousands separator when it repeats or has exactly three digits after it ("1.234").
 */
export function parseAmount(input: string): number | null {
  const trimmed = input.trim()
  const cleaned = trimmed.replace(/[^\d,.\-]/g, "")
  if (!/\d/.test(cleaned)) return null
  const negative = cleaned.startsWith("-") || cleaned.endsWith("-") || /^\(.*\)$/.test(trimmed)
  const digits = cleaned.replace(/-/g, "")
  const lastSep = Math.max(digits.lastIndexOf(","), digits.lastIndexOf("."))
  let isDecimal = false
  if (lastSep !== -1) {
    const sep = digits[lastSep]!
    const other = sep === "," ? "." : ","
    const after = digits.slice(lastSep + 1)
    isDecimal = digits.includes(other) || (digits.indexOf(sep) === lastSep && after.length !== 3)
  }
  const integer = (isDecimal ? digits.slice(0, lastSep) : digits).replace(/[,.]/g, "")
  const value = Number(isDecimal ? `${integer}.${digits.slice(lastSep + 1)}` : integer)
  if (!Number.isFinite(value)) return null
  return negative ? -value : value
}

export interface FormatMoneyOptions {
  /** Always show + or − (for amounts in a list). */
  signed?: boolean
  /** Drop the cents for large, glanceable numbers. */
  compact?: boolean
  locale?: string
}

export function formatMoney(minor: number, currency = "EUR", options: FormatMoneyOptions = {}) {
  const value = fromMinor(minor, currency)
  const formatter = new Intl.NumberFormat(options.locale, {
    style: "currency",
    useGrouping: "always",
    currency,
    signDisplay: options.signed ? "exceptZero" : "auto",
    maximumFractionDigits: options.compact ? 0 : undefined,
    minimumFractionDigits: options.compact ? 0 : undefined,
  })
  // A true minus sign (U+2212) reads better next to figures than a hyphen.
  return formatter.format(value).replace("-", "−")
}
