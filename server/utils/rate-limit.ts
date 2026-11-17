import { errorCode } from "./error-codes"

/**
 * The text of the app's 429s. Pass both to `requireRateLimit`, which ViteHub reads at build time, so keep its limit
 * options literal at the call site. `code` lets the browser translate the message.
 */
export const TOO_MANY_TRIES = "Too many tries. Wait a minute and try again."
export const TOO_MANY_TRIES_CODE = errorCode(TOO_MANY_TRIES)
