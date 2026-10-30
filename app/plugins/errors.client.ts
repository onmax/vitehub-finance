import { initLog } from "evlog/client"

/**
 * Browser errors reach the server's logs (app/utils/client-errors.ts): evlog's client logger, sending to its default
 * ingest endpoint. Vue errors arrive through Nuxt's `vue:error` hook (Nuxt owns `app.config.errorHandler` and calls
 * it), and anything else that escapes through the window's `error` and `unhandledrejection` events. Failed requests
 * report from `useNotify().error` and `<PageError>`, where people see them.
 */
export default defineNuxtPlugin((nuxtApp) => {
  initLog({
    service: "client",
    // DevTools shows them while developing; production keeps the console quiet.
    console: import.meta.dev,
    pretty: true,
    transport: { enabled: true, endpoint: "/api/_evlog/ingest" },
  })
  nuxtApp.hook("vue:error", (error, _instance, info) => reportClientError("vue", error, { info }))
  // What breaks the whole page (error.vue), such as a plugin or a chunk that failed to load.
  nuxtApp.hook("app:error", (error) => reportClientError("unhandled", error))
  useEventListener(window, "unhandledrejection", (event) => reportClientError("unhandled", event.reason))
  useEventListener(window, "error", (event) => {
    // A failed <img> or <script> load has no error object and nothing to report.
    if (event.error) reportClientError("unhandled", event.error)
  })
})
