/** Digits after the decimal point for a currency: 0 for JPY, 2 for EUR. */
export function currencyDigits(currency: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

/** A decimal string ("-12.30", "1234.5") to integer minor units without float rounding surprises. Null when unreadable. */
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
