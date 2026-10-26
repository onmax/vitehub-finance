import { BrokerError } from "./errors.ts"

export interface ClientOptions {
  /** Replaces the global fetch: a proxy, a recorder, or a stub in tests. */
  fetch?: typeof fetch
  /** Sent with every call. Workers send none by default, and IBKR's edge answers 403 without one. */
  userAgent?: string
  /** Per request, in milliseconds. Default 20 seconds. */
  timeoutMs?: number
}

export const DEFAULT_USER_AGENT = "vitehub-finance-brokers (+https://github.com/onmax/vitehub-finance)"

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
      throw new BrokerError("unavailable", `Couldn't reach ${label}. Try again later.`, provider)
    }
  }
}
