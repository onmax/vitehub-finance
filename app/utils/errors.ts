/**
 * The sentence an error carries for people: an h3 HTTPError's `statusText`/`message` (through ofetch's `data`), a
 * Better Auth error's `message`, or a thrown Error's. Falls back to `fallback` for anything else.
 */
export function errorText(error: unknown, fallback = "Something went wrong. Try again.") {
  if (!error) return fallback
  if (typeof error === "string") return error
  const value = error as {
    data?: { statusText?: string; message?: string; statusMessage?: string; data?: { issues?: Array<{ message?: string }> } }
    statusText?: string
    statusMessage?: string
    message?: string
  }
  const candidates = [
    value.data?.data?.issues?.[0]?.message,
    value.data?.statusText,
    value.data?.statusMessage,
    value.data?.message,
    value.statusMessage,
    value.statusText,
    value.message,
  ]
  const found = candidates.find((text) => typeof text === "string" && text.trim() && !/^\[(GET|POST|PATCH|DELETE|PUT)\]/.test(text))
  return found ?? fallback
}

/** The HTTP status of a fetch error, if it has one. */
export function errorStatus(error: unknown): number | undefined {
  const value = error as { status?: number; statusCode?: number; response?: { status?: number } } | null
  return value?.status ?? value?.statusCode ?? value?.response?.status
}
