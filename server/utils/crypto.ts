import { useServerEnv } from "#vitehub/env/server"

/**
 * Bank sessions and exchange keys at rest: AES-GCM with a key derived from `JOXI_ENCRYPTION_KEY`. A database dump alone
 * doesn't give anyone access to a bank or an exchange. WebCrypto, so it runs the same on Workers and Node.
 */
let keyPromise: Promise<CryptoKey> | undefined

function key() {
  keyPromise ??= (async () => {
    const secret = useServerEnv().joxi.encryptionKey.unseal()
    if (!secret || secret.length < 16) throw new Error("JOXI_ENCRYPTION_KEY must be set to a random string of 16 characters or more.")
    const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`joxi:credentials:${secret}`))
    return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"])
  })()
  return keyPromise
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))

export async function seal(value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new TextEncoder().encode(JSON.stringify(value))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), data))
  return `v1.${toBase64(iv)}.${toBase64(cipher)}`
}

export async function unseal<T>(sealed: string | null | undefined): Promise<T | null> {
  if (!sealed) return null
  const [version, iv, cipher] = sealed.split(".")
  if (version !== "v1" || !iv || !cipher) throw new Error("Unknown credential format.")
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, await key(), fromBase64(cipher))
  return JSON.parse(new TextDecoder().decode(plain)) as T
}
