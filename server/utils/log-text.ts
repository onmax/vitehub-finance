// Free text that reaches the logs from outside (browser error reports): no queries, no personal numbers, bounded.
// Pure, so nuxt.config.ts (evlog's redaction) imports it too.

/**
 * A URL's query and fragment: `?` or `#` and what follows, after a path (anything with a `/` before it, so "Why?"
 * stays). They hold searches, filters, and OAuth or bank codes (`/api/connect/callback?code=…`). The `?` comes before
 * the look back, so only a `?` or `#` costs a scan.
 */
export const URL_QUERY = /[?#](?<=\/[^\s"'`<>()?#]*[?#])[^\s"'`<>()]+/g

// No `/` or `:` in either part, so stack frames (`fn@https://…`, `node_modules/@vue/…`) stay readable.
const EMAIL = /[^\s@"'`<>()[\]{}:;,/]+@[^\s@"'`<>()[\]{}:;,/]+\.[a-z]{2,}/gi
// Two letters, two check digits, then 11 to 30 letters or digits, maybe grouped by spaces: ES91 2100 0418 4502 0005 1332.
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g
// Six digits or more, maybe grouped by spaces, dots, or dashes: card and account numbers, amounts, phone numbers. Not
// right after a colon: a stack frame's line and column (`entry.js:1:104523`).
const DIGITS = /(?<![:\d])\d(?:[ .-]?\d){5,}/g

/**
 * Removes queries and fragments from every URL in the text, masks emails, IBANs, and long digit runs, and cuts it to
 * `max` characters. It reads at most twice that, which bounds the patterns' work.
 */
export function scrubLogText(text: string, max: number) {
  return text
    .slice(0, max * 2)
    .replace(URL_QUERY, "")
    .replace(EMAIL, "[email]")
    .replace(IBAN, "[iban]")
    .replace(DIGITS, "[number]")
    .slice(0, max)
}
