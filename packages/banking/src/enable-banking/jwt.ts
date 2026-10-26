// The app's RS256 JWT, signed with WebCrypto so it runs the same on Workers and Node.

type Bytes = Uint8Array<ArrayBuffer>
const encoder = new TextEncoder()
const utf8 = (text: string): Bytes => encoder.encode(text)

export function toBase64(bytes: Bytes) {
  let binary = ""
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary)
}
const fromBase64 = (text: string) => Uint8Array.from(atob(text.replace(/\s+/g, "")), (char) => char.charCodeAt(0))
const toBase64Url = (bytes: Bytes) => toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

/** Env vars and form fields often carry a PEM on one line with literal `\n`; this restores the newlines. */
export const normalizePem = (pem: string) =>
  pem.trim().replace(/^["']|["']$/g, "").replace(/\\r/g, "").replace(/\\n/g, "\n").trim()

/** RS256 with a PKCS#8 PEM. WebCrypto can't read PKCS#1 ("BEGIN RSA PRIVATE KEY"), so that gets a fix-it message. */
export async function importRsaKey(pem: string) {
  const normalized = normalizePem(pem)
  const label = normalized.match(/-----BEGIN ([A-Z0-9 ]+)-----/)?.[1] ?? null
  if (label === "RSA PRIVATE KEY")
    throw new Error(
      "The private key is PKCS#1 (BEGIN RSA PRIVATE KEY). Convert it to PKCS#8 with `openssl pkcs8 -topk8 -nocrypt -in key.pem -out key-pkcs8.pem`.",
    )
  if (label !== "PRIVATE KEY") throw new Error("The private key must be a PKCS#8 PEM (BEGIN PRIVATE KEY).")
  const der = fromBase64(normalized.replace(/-----(BEGIN|END) [A-Z0-9 ]+-----/g, "").replace(/\s+/g, ""))
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"])
}

export async function signRs256(header: object, payload: object, key: CryptoKey) {
  const input = `${toBase64Url(utf8(JSON.stringify({ ...header, alg: "RS256" })))}.${toBase64Url(utf8(JSON.stringify(payload)))}`
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, utf8(input)))
  return `${input}.${toBase64Url(signature)}`
}
