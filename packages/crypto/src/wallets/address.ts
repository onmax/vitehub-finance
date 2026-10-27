import type { ChainId } from "../model.ts"

const BASE58 = "[1-9A-HJ-NP-Za-km-z]"
const PATTERNS: Record<Exclude<ChainId, "nimiq">, RegExp> = {
  // Legacy (1…), P2SH (3…), and bech32/bech32m (bc1…, lowercase or uppercase, not mixed).
  bitcoin: new RegExp(`^(?:[13]${BASE58}{25,34}|bc1[02-9ac-hj-np-z]{11,71}|BC1[02-9AC-HJ-NP-Z]{11,71})$`),
  ethereum: /^0x[0-9a-fA-F]{40}$/,
  // An Ethereum address: the same key holds coins on every EVM chain.
  polygon: /^0x[0-9a-fA-F]{40}$/,
  solana: new RegExp(`^${BASE58}{32,44}$`),
  xrpl: /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/,
}

/** IBAN's mod-97 check over digits and letters (A = 10 … Z = 35). */
function mod97(text: string) {
  let rest = 0
  for (const char of text) {
    const value = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55)
    for (const digit of value) rest = (rest * 10 + Number(digit)) % 97
  }
  return rest
}

/**
 * A Nimiq address in its user-friendly form ("NQ07 0000 … 0000"), with or without spaces, any case. Nimiq addresses
 * carry an IBAN check, so a typo is caught here instead of watching an empty account. Returns the spaced, uppercase form.
 */
export function parseNimiqAddress(input: string) {
  const compact = input.replace(/\s+/g, "").toUpperCase()
  // Nimiq's base32 alphabet leaves out I, O, W, and Z.
  if (!/^NQ\d{2}[0-9A-HJ-NP-VXY]{32}$/.test(compact)) return null
  if (mod97(compact.slice(4) + compact.slice(0, 4)) !== 1) return null
  return compact.match(/.{4}/g)!.join(" ")
}

/** The address, normalized, when it is one of this chain's; null otherwise. */
export function parseAddress(chain: ChainId, input: string) {
  if (chain === "nimiq") return parseNimiqAddress(input)
  const trimmed = input.trim()
  return PATTERNS[chain].test(trimmed) ? trimmed : null
}
