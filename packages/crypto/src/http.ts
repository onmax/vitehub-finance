import { CryptoError } from "./errors.ts"

export interface ClientOptions {
  /** Replaces the global fetch: a proxy, a recorder, or a stub in tests. */
  fetch?: typeof fetch
  /** Sent with every call. Workers send none by default, and some APIs refuse requests without one. */
  userAgent?: string
  /** Per request, in milliseconds. Default 20 seconds. */
  timeoutMs?: number
}

export const DEFAULT_USER_AGENT = "vitehub-finance-crypto (+https://github.com/onmax/vitehub-finance)"

export type Request = (url: string, init?: RequestInit) => Promise<Response>

/** A fetch for one provider: its user agent and timeout, and network failures as `unavailable` errors. */
export function requester(provider: string, label: string, options: ClientOptions = {}): Request {
  const send = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))
  return async (url, init = {}) => {
    const headers = new Headers(init.headers)
    if (!headers.has("user-agent")) headers.set("user-agent", options.userAgent ?? DEFAULT_USER_AGENT)
    try {
      return await send(url, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(options.timeoutMs ?? 20_000) })
    } catch {
      throw new CryptoError("unavailable", `Couldn't reach ${label}. Try again later.`, provider)
    }
  }
}

/** A JSON (or text) body, without throwing on malformed responses. */
export async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "")
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** A short, readable reason from an error body. */
export function describeBody(body: unknown, fallback: string) {
  if (typeof body === "string") return body.slice(0, 200) || fallback
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>
    for (const key of ["message", "msg", "error_description", "detail", "data", "error"]) {
      const value = record[key]
      if (typeof value === "string" && value) return value.slice(0, 200)
      if (Array.isArray(value) && value.length) return value.map(String).join(", ").slice(0, 200)
    }
  }
  return fallback
}

/** A JSON-RPC 2.0 call. Its `error` comes back as the result's `error`, for the caller to judge. */
export async function jsonRpc(request: Request, url: string, method: string, params: unknown) {
  const response = await request(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  return { response, body: (await readBody(response)) as { result?: any; error?: { code?: number; message?: string; data?: unknown } } }
}
