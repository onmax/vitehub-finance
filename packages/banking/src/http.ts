import { BankingError } from "./errors.ts"

export interface ClientOptions {
  /** Replaces the global fetch: a proxy, a recorder, or a stub in tests. */
  fetch?: typeof fetch
  /** Sent with every call. Workers send none by default, and some APIs refuse requests without one. */
  userAgent?: string
  /** Per request, in milliseconds. Default 20 seconds. */
  timeoutMs?: number
}

export const DEFAULT_USER_AGENT = "vitehub-finance-banking (+https://github.com/onmax/vitehub-finance)"

export type Request = (url: string, init?: RequestInit) => Promise<Response>

/** A fetch for one provider: its user agent and timeout, and network failures as `unavailable` errors. */
export function requester(provider: string, label: string, options: ClientOptions = {}): Request {
  const send = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))
  return async (url, init = {}) => {
    const headers = new Headers(init.headers)
    if (!headers.has("user-agent")) headers.set("user-agent", options.userAgent ?? DEFAULT_USER_AGENT)
    try {
      return await send(url, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(options.timeoutMs ?? 20_000) })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new BankingError("unavailable", `${label} could not be reached (${reason}).`, provider)
    }
  }
}

export async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "")
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function describeBody(body: unknown, fallback: string) {
  if (typeof body === "string") return body.slice(0, 200) || fallback
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>
    for (const key of ["message", "msg", "error_description", "detail", "error"]) {
      const value = record[key]
      if (typeof value === "string" && value) return value.slice(0, 200)
      if (Array.isArray(value) && value.length) return value.map(String).join(", ").slice(0, 200)
    }
  }
  return fallback
}
