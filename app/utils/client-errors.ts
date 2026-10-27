import { log } from "evlog/client"

export type ClientErrorKind = "vue" | "unhandled" | "toast" | "load"

interface ClientErrorContext {
  /** Vue's lifecycle hint, such as "setup function". */
  info?: string
  /** The toast's or alert's title, which says what the person was doing. */
  title?: string
}

const sent = new Set<string>()
const MAX_PER_PAGE_LOAD = 10

/**
 * Tells the server something failed in this browser (evlog's client transport to server/handlers/client-errors.ts),
 * where it becomes an error-level wide event. At most once per message and ten times per page load. It sends the
 * page's path, never its query, and for a failed request its method, path, and status. It never throws: reporting an
 * error mustn't make another one.
 */
export function reportClientError(kind: ClientErrorKind, error: unknown, context: ClientErrorContext = {}) {
  if (!import.meta.client) return
  try {
    const failure = error instanceof Error ? error : new Error(typeof error === "string" ? error : errorText(error, translate('unknownError')))
    // Navigating away aborts requests; that's not a failure.
    if (failure.name === "AbortError") return
    const status = errorStatus(error)
    // A request's error is worded by the server. Any URL left in a message loses its query.
    const message = (status === undefined ? failure.message : errorText(error)).replace(/\?[^\s"'`]*/g, "")
    const key = `${kind}:${message}`
    if (sent.has(key) || sent.size >= MAX_PER_PAGE_LOAD) return
    sent.add(key)
    log.error({
      clientError: {
        kind,
        path: window.location.pathname,
        name: failure.name,
        message,
        stack: status === undefined ? failure.stack : undefined,
        request: requestOf(error),
        status,
        ...context,
      },
    })
  } catch {
    // Nothing to do: the report was best effort.
  }
}

/** "PATCH /api/transactions/<id>" for an ofetch error, without the query. */
function requestOf(error: unknown) {
  const value = error as { request?: unknown; options?: { method?: string } } | null
  const request = value?.request
  const url = typeof request === "string" ? request : request instanceof Request ? request.url : undefined
  if (!url) return undefined
  const path = new URL(url, window.location.origin).pathname
  return `${(value?.options?.method ?? "GET").toUpperCase()} ${path}`
}
