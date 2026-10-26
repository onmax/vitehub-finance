// WebCrypto only, so it runs the same on Workers, Node, Deno, and Bun: HMACs (Kraken, Binance) and JWTs (Coinbase).

export type Bytes = Uint8Array<ArrayBuffer>

const encoder = new TextEncoder()
export const utf8 = (text: string): Bytes => encoder.encode(text)

export function toBase64(bytes: Bytes) {
  let binary = ""
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary)
}

export const fromBase64 = (text: string) => Uint8Array.from(atob(text.replace(/\s+/g, "")), (char) => char.charCodeAt(0))
export const toBase64Url = (bytes: Bytes) => toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
export const fromBase64Url = (text: string) => {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/")
  return fromBase64(base64 + "=".repeat((4 - (base64.length % 4)) % 4))
}
export const toHex = (bytes: Bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
export const randomHex = (length = 16) => toHex(crypto.getRandomValues(new Uint8Array(length)))

export async function sha256(data: Bytes | string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", typeof data === "string" ? utf8(data) : data))
}

export async function hmac(hash: "SHA-256" | "SHA-512", key: Bytes, data: Bytes | string) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash }, false, ["sign"])
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, typeof data === "string" ? utf8(data) : data))
}

/** Env vars and form fields often carry a PEM on one line with literal `\n`; this restores the newlines. */
export const normalizePem = (pem: string) =>
  pem.trim().replace(/^["']|["']$/g, "").replace(/\\r/g, "").replace(/\\n/g, "\n").trim()

const pemLabel = (pem: string) => normalizePem(pem).match(/-----BEGIN ([A-Z0-9 ]+)-----/)?.[1] ?? null
const pemToDer = (pem: string) =>
  fromBase64(
    normalizePem(pem)
      .replace(/-----(BEGIN|END) [A-Z0-9 ]+-----/g, "")
      .replace(/\s+/g, ""),
  )

function derLength(length: number) {
  if (length < 0x80) return [length]
  const bytes: number[] = []
  for (let rest = length; rest > 0; rest >>= 8) bytes.unshift(rest & 0xff)
  return [0x80 | bytes.length, ...bytes]
}
const der = (tag: number, content: Bytes) => new Uint8Array([tag, ...derLength(content.length), ...content])
const concat = (...parts: Bytes[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

// AlgorithmIdentifier { id-ecPublicKey, prime256v1 }.
const P256_ALGORITHM = new Uint8Array([
  0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
])
// PKCS#8 prefix for a raw 32-byte Ed25519 seed.
const ED25519_PREFIX = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20])

/** SEC1 ("BEGIN EC PRIVATE KEY") is what Coinbase hands out; WebCrypto only imports PKCS#8, so wrap it. */
export const sec1ToPkcs8 = (sec1: Bytes) => der(0x30, concat(new Uint8Array([0x02, 0x01, 0x00]), P256_ALGORITHM, der(0x04, sec1)))

export type SigningKey = { alg: "ES256" | "EdDSA"; key: CryptoKey }

/** A Coinbase CDP secret: an EC PEM (SEC1 or PKCS#8) or a base64 Ed25519 secret (seed + public key, or the seed alone). */
export async function importCdpKey(secret: string): Promise<SigningKey> {
  const label = pemLabel(secret)
  if (label === "EC PRIVATE KEY" || label === "PRIVATE KEY") {
    const bytes = pemToDer(secret)
    const pkcs8 = label === "EC PRIVATE KEY" ? sec1ToPkcs8(bytes) : bytes
    return { alg: "ES256", key: await crypto.subtle.importKey("pkcs8", pkcs8, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]) }
  }
  const raw = fromBase64(secret.trim())
  if (raw.length !== 64 && raw.length !== 32) throw new Error("The secret is neither an EC PEM nor a base64 Ed25519 key.")
  return { alg: "EdDSA", key: await crypto.subtle.importKey("pkcs8", concat(ED25519_PREFIX, raw.slice(0, 32)), { name: "Ed25519" }, false, ["sign"]) }
}

/** ES256 (WebCrypto's ECDSA output is already the raw r||s JWS wants) or EdDSA. */
export async function signJwt(header: object, payload: object, signing: SigningKey) {
  const input = `${toBase64Url(utf8(JSON.stringify({ ...header, alg: signing.alg })))}.${toBase64Url(utf8(JSON.stringify(payload)))}`
  const algorithm = signing.alg === "ES256" ? { name: "ECDSA", hash: "SHA-256" } : { name: "Ed25519" }
  const signature = new Uint8Array(await crypto.subtle.sign(algorithm, signing.key, utf8(input)))
  return `${input}.${toBase64Url(signature)}`
}
