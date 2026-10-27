import { i18n } from "../lib/i18n"

/** Also usable from utility functions and asynchronous event handlers outside Vue setup. */
export function translate(key: string, values: Record<string, unknown> = {}, count?: number) {
  return count === undefined ? i18n.global.t(key, values) : i18n.global.t(key, values, count)
}
