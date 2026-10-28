/** Share of incoming money left after spending; undefined until there is income. */
export function savingsRate(inMinor: number, outMinor: number) {
  return inMinor > 0 ? (inMinor - outMinor) / inMinor : null
}

/** A zero baseline has no percentage change; a negative balance uses its magnitude. */
export function relativeChange(current: number, previous: number) {
  return previous === 0 ? null : (current - previous) / Math.abs(previous)
}
